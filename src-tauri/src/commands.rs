use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::task::AbortHandle;

// ─── Watcher State ────────────────────────────────────────────────────────────

/// Holds abort handles for all background watcher tasks, keyed by profile name.
/// The colima status poller is stored under the key "__poller__".
pub struct WatcherState {
    pub handles: Mutex<HashMap<String, AbortHandle>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self { handles: Mutex::new(HashMap::new()) }
    }
}

/// Payload emitted to the frontend for each Docker daemon event.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DockerEventPayload {
    pub profile: String,
    pub event_type: String, // "container" | "image" | "volume" | "network"
    pub action: String,     // "start" | "stop" | "die" | "pull" | "create" | "destroy" …
    pub actor_id: String,
    pub actor_name: String,
}

/// Prepend common Homebrew and system paths so GUI app finds colima/docker.
const EXTRA_PATH: &str =
    "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    c.env("PATH", EXTRA_PATH);
    c
}

fn extract_label(labels: &str, key: &str) -> String {
    labels
        .split(',')
        .find_map(|kv| kv.strip_prefix(&format!("{}=", key)))
        .unwrap_or("")
        .to_string()
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DockerContainer {
    // rename(deserialize) = read Docker's capitalized keys from `docker ps`
    // serialize (to frontend) uses the lowercase field names that TypeScript expects
    #[serde(rename(deserialize = "ID"), default)]
    pub id: String,
    #[serde(rename(deserialize = "Names"), default)]
    pub names: String,
    #[serde(rename(deserialize = "Image"), default)]
    pub image: String,
    #[serde(rename(deserialize = "Status"), default)]
    pub status: String,
    #[serde(rename(deserialize = "Ports"), default)]
    pub ports: String,
    #[serde(rename(deserialize = "Labels"), default)]
    labels: String,
    #[serde(rename(serialize = "composeProject"), skip_deserializing, default)]
    pub compose_project: String,
    #[serde(rename(serialize = "composeService"), skip_deserializing, default)]
    pub compose_service: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ColimaInstance {
    pub profile: String,
    pub status: String,
    pub arch: String,
    pub cpus: String,
    pub memory: String,
    pub disk: String,
    pub runtime: String,
    pub address: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub profile: String,
    pub cpu: u32,
    pub memory: u32,
    pub disk: u32,
    pub vm_type: String,
    pub runtime: String,
    pub rosetta: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub profile: String,
    pub line: String,
    pub is_error: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct DockerContext {
    pub name: String,
    pub current: bool,
    pub endpoint: String,
}

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_instances() -> Result<Vec<ColimaInstance>, String> {
    let out = cmd("colima")
        .args(["list"])
        .output()
        .await
        .map_err(|e| format!("colima not found — is it installed? ({})", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();

    // `colima list` exits 1 when there are no instances but still prints a header
    if stdout.trim().is_empty() && !stderr.is_empty() {
        return Err(stderr);
    }

    parse_colima_list(&stdout)
}

fn parse_colima_list(raw: &str) -> Result<Vec<ColimaInstance>, String> {
    let mut instances = Vec::new();
    for line in raw.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() >= 7 {
            instances.push(ColimaInstance {
                profile: cols[0].to_string(),
                status: cols[1].to_string(),
                arch: cols[2].to_string(),
                cpus: cols[3].to_string(),
                memory: cols[4].to_string(),
                disk: cols[5].to_string(),
                runtime: cols[6].to_string(),
                address: cols.get(7).unwrap_or(&"—").to_string(),
            });
        }
    }
    Ok(instances)
}

#[tauri::command]
pub async fn start_instance(app: AppHandle, options: StartOptions) -> Result<(), String> {
    let mut args = vec![
        "start".to_string(),
        "--profile".to_string(),
        options.profile.clone(),
        "--cpu".to_string(),
        options.cpu.to_string(),
        "--memory".to_string(),
        options.memory.to_string(),
        "--disk".to_string(),
        options.disk.to_string(),
        "--vm-type".to_string(),
        options.vm_type.clone(),
        "--runtime".to_string(),
        options.runtime.clone(),
    ];
    if options.rosetta {
        args.push("--vz-rosetta".to_string());
    }

    run_streaming(app, "colima", args, options.profile).await
}

#[tauri::command]
pub async fn stop_instance(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec!["stop".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
}

#[tauri::command]
pub async fn restart_instance(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec!["restart".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
}

#[tauri::command]
pub async fn delete_instance(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec![
            "delete".into(),
            "--profile".into(),
            profile.clone(),
            "--force".into(),
        ],
        profile,
    )
    .await
}

#[tauri::command]
pub async fn prune_instance(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec![
            "prune".into(),
            "--force".into(),
            "--profile".into(),
            profile.clone(),
        ],
        profile,
    )
    .await
}

/// Force-stop an instance (used for crash recovery when the VM is stuck).
#[tauri::command]
pub async fn force_stop_instance(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec![
            "stop".into(),
            "--force".into(),
            "--profile".into(),
            profile.clone(),
        ],
        profile,
    )
    .await
}

/// Kill stale Lima/QEMU processes for a profile (nuclear recovery option).
#[tauri::command]
pub async fn kill_stale_processes(profile: String) -> Result<String, String> {
    // Kill lima processes for this profile
    let lima_pattern = format!("lima/{}", if profile == "default" { "colima".to_string() } else { format!("colima-{}", profile) });
    let _ = Command::new("pkill")
        .args(["-f", &lima_pattern])
        .output()
        .await;

    // Also kill any qemu processes for this profile
    let qemu_pattern = format!("qemu.*{}", if profile == "default" { "colima".to_string() } else { format!("colima-{}", profile) });
    let _ = Command::new("pkill")
        .args(["-f", &qemu_pattern])
        .output()
        .await;

    // Brief pause for processes to die
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    Ok(format!("Killed stale processes matching '{}'", lima_pattern))
}

/// Streams stdout/stderr of a child process as `log-line` events.
async fn run_streaming(
    app: AppHandle,
    program: &str,
    args: Vec<String>,
    profile: String,
) -> Result<(), String> {
    let mut child = cmd(program)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn `{}`: {}", program, e))?;

    // Stream stdout
    if let Some(stdout) = child.stdout.take() {
        let app2 = app.clone();
        let prof = profile.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app2.emit(
                    "log-line",
                    LogLine {
                        profile: prof.clone(),
                        line,
                        is_error: false,
                    },
                );
            }
        });
    }

    // Stream stderr
    if let Some(stderr) = child.stderr.take() {
        let app2 = app.clone();
        let prof = profile.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app2.emit(
                    "log-line",
                    LogLine {
                        profile: prof.clone(),
                        line,
                        is_error: true,
                    },
                );
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Command wait error: {}", e))?;

    if !status.success() {
        return Err(format!(
            "`{}` exited with status {}",
            program,
            status.code().unwrap_or(-1)
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_version() -> Result<String, String> {
    let out = cmd("colima")
        .args(["version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
pub async fn get_docker_contexts() -> Result<Vec<DockerContext>, String> {
    let out = cmd("docker")
        .args(["context", "ls", "--format", "{{.Name}}\t{{.Current}}\t{{.DockerEndpoint}}"])
        .output()
        .await
        .map_err(|e| format!("docker not found ({})", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let mut contexts = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(3, '\t').collect();
        if parts.len() == 3 {
            contexts.push(DockerContext {
                name: parts[0].trim().to_string(),
                current: parts[1].trim() == "true" || parts[1].trim() == "*",
                endpoint: parts[2].trim().to_string(),
            });
        }
    }

    Ok(contexts)
}

#[tauri::command]
pub async fn read_config(profile: String) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME env var not set".to_string())?;
    let path = format!("{}/.colima/{}/colima.yaml", home, profile);
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| format!("Cannot read config at {}: {}", path, e))
}

/// Returns Docker containers for any named Docker context (generic).
#[tauri::command]
pub async fn get_containers_by_context(context: String, show_all: bool) -> Result<Vec<DockerContainer>, String> {
    fetch_containers(&context, show_all).await
}

// ─── Container log line type ──────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContainerLogLine {
    pub text: String,
    pub is_err: bool,
}

// ─── Container actions ────────────────────────────────────────────────────────

/// Run start / stop / restart / pause / unpause on a Docker container.
#[tauri::command]
pub async fn container_action(
    context: String,
    container_id: String,
    action: String,
) -> Result<(), String> {
    let allowed = ["start", "stop", "restart", "pause", "unpause", "rm"];
    if !allowed.contains(&action.as_str()) {
        return Err(format!("invalid action '{}'", action));
    }

    let out = cmd("docker")
        .args(["--context", &context, &action, &container_id])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`docker {}` failed (status {})", action, out.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }
    Ok(())
}

/// Fetch the last `tail` log lines for a container.
/// Docker writes container stdout → process stdout, container stderr → process stderr.
/// We return both streams with an is_err flag for colour-coding.
#[tauri::command]
pub async fn get_container_logs(
    context: String,
    container_id: String,
    tail: u32,
) -> Result<Vec<ContainerLogLine>, String> {
    let tail_str = tail.to_string();

    let out = cmd("docker")
        .args(["--context", &context, "logs", "--tail", &tail_str, &container_id])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    let mut lines: Vec<ContainerLogLine> = Vec::new();
    for l in String::from_utf8_lossy(&out.stdout).lines() {
        if !l.trim().is_empty() {
            lines.push(ContainerLogLine { text: l.to_string(), is_err: false });
        }
    }
    for l in String::from_utf8_lossy(&out.stderr).lines() {
        if !l.trim().is_empty() {
            lines.push(ContainerLogLine { text: l.to_string(), is_err: true });
        }
    }
    Ok(lines)
}

/// Shared helper: runs `docker --context <ctx> ps --format "{{json .}}"` and parses output.
async fn fetch_containers(context: &str, show_all: bool) -> Result<Vec<DockerContainer>, String> {
    let mut args = vec!["--context", context, "ps", "--format", "{{json .}}"];
    if show_all {
        args.push("--all");
    }
    let out = cmd("docker")
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut containers = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(mut c) = serde_json::from_str::<DockerContainer>(line) {
            c.compose_project = extract_label(&c.labels, "com.docker.compose.project");
            c.compose_service = extract_label(&c.labels, "com.docker.compose.service");
            containers.push(c);
        }
    }
    Ok(containers)
}

/// Maps a Colima profile name to its Docker context name.
///   default profile → "colima"
///   named profile   → "colima-<profile>"
fn profile_to_context(profile: &str) -> String {
    if profile == "default" {
        "colima".to_string()
    } else {
        format!("colima-{}", profile)
    }
}

/// Returns Docker containers running inside a Colima instance.
#[tauri::command]
pub async fn get_containers(profile: String, show_all: bool) -> Result<Vec<DockerContainer>, String> {
    fetch_containers(&profile_to_context(&profile), show_all).await
}

// ─── Images ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DockerImage {
    #[serde(rename(deserialize = "ID"), default)]
    pub id: String,
    #[serde(rename(deserialize = "Repository"), default)]
    pub repository: String,
    #[serde(rename(deserialize = "Tag"), default)]
    pub tag: String,
    #[serde(rename(deserialize = "Size"), default)]
    pub size: String,
    #[serde(rename(deserialize = "CreatedSince"), default)]
    pub created_since: String,
}

/// List images in a Colima instance's Docker context.
#[tauri::command]
pub async fn get_images(profile: String) -> Result<Vec<DockerImage>, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "images", "--format", "{{json .}}"])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        return Ok(vec![]);
    }

    let mut images = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(img) = serde_json::from_str::<DockerImage>(line) {
            images.push(img);
        }
    }
    Ok(images)
}

/// Prune dangling images (untagged, not referenced by any container) — safe to run anytime.
#[tauri::command]
pub async fn prune_images(profile: String) -> Result<String, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "image", "prune", "--force"])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Remove an image by ID from a Colima instance's Docker context.
#[tauri::command]
pub async fn remove_image(profile: String, image_id: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "rmi", &image_id])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`docker rmi` failed (status {})", out.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }
    Ok(())
}

// ─── Volumes ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DockerVolume {
    #[serde(rename(deserialize = "Name"), default)]
    pub name: String,
    #[serde(rename(deserialize = "Driver"), default)]
    pub driver: String,
    #[serde(rename(deserialize = "Mountpoint"), default)]
    pub mountpoint: String,
}

/// List volumes in a Colima instance's Docker context.
#[tauri::command]
pub async fn get_volumes(profile: String) -> Result<Vec<DockerVolume>, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "volume", "ls", "--format", "{{json .}}"])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        return Ok(vec![]);
    }

    let mut volumes = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(vol) = serde_json::from_str::<DockerVolume>(line) {
            volumes.push(vol);
        }
    }
    Ok(volumes)
}

/// Prune volumes not referenced by any container — safe to run when containers are stopped.
#[tauri::command]
pub async fn prune_volumes(profile: String) -> Result<String, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "volume", "prune", "--force"])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(stderr);
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Remove a named volume from a Colima instance's Docker context.
#[tauri::command]
pub async fn remove_volume(profile: String, volume_name: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "volume", "rm", &volume_name])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`docker volume rm` failed (status {})", out.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }
    Ok(())
}

// ─── Colima AI Models ─────────────────────────────────────────────────────────

/// Run `colima model setup` for a given profile.
/// First starts a krunkit instance (required for model support), then runs setup.
/// Streams all output as log-line events.
#[tauri::command]
pub async fn colima_model_setup(app: AppHandle, profile: String) -> Result<(), String> {
    // Step 1: Start/ensure a krunkit + docker instance is running
    let mut start_args = vec![
        "start".to_string(),
        "--runtime".to_string(),
        "docker".to_string(),
        "--vm-type".to_string(),
        "krunkit".to_string(),
    ];
    if profile != "default" {
        start_args.extend(["--profile".to_string(), profile.clone()]);
    }
    // Ignore start errors — instance may already be running
    let _ = run_streaming(app.clone(), "colima", start_args, profile.clone()).await;

    // Step 2: Run model setup
    let mut setup_args = vec!["model".to_string(), "setup".to_string()];
    if profile != "default" {
        setup_args.extend(["--profile".to_string(), profile.clone()]);
    }
    run_streaming(app, "colima", setup_args, profile).await
}

/// Run `colima model run <model>` for a given profile (streams output).
/// Supports registry prefixes: hf://, ollama://, or bare model names (HuggingFace default).
#[tauri::command]
pub async fn colima_model_run(
    app: AppHandle,
    profile: String,
    model: String,
) -> Result<(), String> {
    let mut args = vec!["model".to_string(), "run".to_string(), model];
    if profile != "default" {
        args.extend(["--profile".to_string(), profile.clone()]);
    }
    run_streaming(app, "colima", args, profile).await
}

/// Read a profile's colima.yaml and extract the vmType field.
/// Returns an empty string if the profile doesn't use a special VM type.
#[tauri::command]
pub async fn get_vm_type(profile: String) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    let path = format!("{}/.colima/{}/colima.yaml", home, profile);
    let content = tokio::fs::read_to_string(&path).await.unwrap_or_default();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("vmType:") || trimmed.starts_with("vm_type:") {
            let val = trimmed
                .splitn(2, ':')
                .nth(1)
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .to_string();
            return Ok(val);
        }
    }
    Ok(String::new())
}

// ─── Real-time Docker Event Watcher ───────────────────────────────────────────

/// Start streaming `docker events` for a Colima profile.
/// Emits "docker-event" Tauri events to the frontend for every daemon event.
/// Replaces any existing watcher for the same profile.
#[tauri::command]
pub async fn start_docker_watcher(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    profile: String,
) -> Result<(), String> {
    // Cancel any existing watcher for this profile
    if let Some(old) = state.handles.lock().unwrap().remove(&profile) {
        old.abort();
    }

    let context = profile_to_context(&profile);
    let prof = profile.clone();

    let handle = tokio::spawn(async move {
        let child = cmd("docker")
            .args(["--context", &context, "events", "--format", "{{json .}}"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(_) => return,
        };

        if let Some(stdout) = child.stdout.take() {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(raw) = serde_json::from_str::<serde_json::Value>(&line) {
                    let event_type = raw["Type"]
                        .as_str()
                        .unwrap_or("unknown")
                        .to_lowercase();
                    let action = raw["Action"].as_str().unwrap_or("").to_string();
                    let actor_id = raw["Actor"]["ID"].as_str().unwrap_or("").to_string();
                    // Containers have a "name" attribute; images/volumes use their ID as name
                    let actor_name = raw["Actor"]["Attributes"]["name"]
                        .as_str()
                        .unwrap_or(raw["Actor"]["ID"].as_str().unwrap_or(""))
                        .to_string();

                    let _ = app.emit(
                        "docker-event",
                        DockerEventPayload {
                            profile: prof.clone(),
                            event_type,
                            action,
                            actor_id,
                            actor_name,
                        },
                    );
                }
            }
        }

        let _ = child.wait().await;
        // Task ends naturally when `docker events` exits (e.g. VM stopped).
        // App.tsx will restart the watcher if/when the VM comes back up.
    });

    state
        .handles
        .lock()
        .unwrap()
        .insert(profile, handle.abort_handle());

    Ok(())
}

/// Stop the Docker event watcher for a specific profile.
#[tauri::command]
pub async fn stop_docker_watcher(
    state: tauri::State<'_, WatcherState>,
    profile: String,
) -> Result<(), String> {
    if let Some(handle) = state.handles.lock().unwrap().remove(&profile) {
        handle.abort();
    }
    Ok(())
}

// ─── Container Log Streaming ──────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContainerLogLineEvent {
    pub container_id: String,
    pub text: String,
    pub is_err: bool,
}

/// Stream `docker logs --follow --tail N <container_id>` and emit
/// "container-log-line" events. The stream is stored in WatcherState under
/// the key "clog:<container_id>" so it can be cancelled on drawer close.
#[tauri::command]
pub async fn stream_container_logs(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
    context: String,
    container_id: String,
    tail: u32,
) -> Result<(), String> {
    let key = format!("clog:{}", container_id);

    // Cancel any existing stream for this container
    if let Some(old) = state.handles.lock().unwrap().remove(&key) {
        old.abort();
    }

    let tail_str = tail.to_string();
    let cid = container_id.clone();

    let handle = tokio::spawn(async move {
        let child = cmd("docker")
            .args(["--context", &context, "logs", "--follow", "--tail", &tail_str, &cid])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(_) => return,
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let app_out = app.clone();
        let cid_out = cid.clone();
        let stdout_task = tokio::spawn(async move {
            if let Some(s) = stdout {
                let mut lines = BufReader::new(s).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = app_out.emit(
                        "container-log-line",
                        ContainerLogLineEvent { container_id: cid_out.clone(), text: line, is_err: false },
                    );
                }
            }
        });

        let app_err = app.clone();
        let cid_err = cid.clone();
        let stderr_task = tokio::spawn(async move {
            if let Some(s) = stderr {
                let mut lines = BufReader::new(s).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = app_err.emit(
                        "container-log-line",
                        ContainerLogLineEvent { container_id: cid_err.clone(), text: line, is_err: true },
                    );
                }
            }
        });

        let _ = tokio::join!(stdout_task, stderr_task);
        let _ = child.wait().await;
    });

    state
        .handles
        .lock()
        .unwrap()
        .insert(key, handle.abort_handle());

    Ok(())
}

/// Stop the live log stream for a container.
#[tauri::command]
pub async fn stop_container_log_stream(
    state: tauri::State<'_, WatcherState>,
    container_id: String,
) -> Result<(), String> {
    let key = format!("clog:{}", container_id);
    if let Some(handle) = state.handles.lock().unwrap().remove(&key) {
        handle.abort();
    }
    Ok(())
}

// ─── Colima Status Poller ─────────────────────────────────────────────────────

/// Poll `colima list` every 3 seconds and emit "colima-status-changed" when
/// the instance list changes. Replaces the 20-second JS setInterval.
#[tauri::command]
pub async fn start_colima_poller(
    app: AppHandle,
    state: tauri::State<'_, WatcherState>,
) -> Result<(), String> {
    // Cancel any existing poller
    if let Some(old) = state.handles.lock().unwrap().remove("__poller__") {
        old.abort();
    }

    let handle = tokio::spawn(async move {
        let mut last_raw = String::new();
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;

            if let Ok(out) = cmd("colima").args(["list"]).output().await {
                let raw = String::from_utf8_lossy(&out.stdout).to_string();
                // Only parse + emit when the raw output changed
                if raw != last_raw {
                    if let Ok(instances) = parse_colima_list(&raw) {
                        let _ = app.emit("colima-status-changed", &instances);
                    }
                    last_raw = raw;
                }
            }
        }
    });

    state
        .handles
        .lock()
        .unwrap()
        .insert("__poller__".to_string(), handle.abort_handle());

    Ok(())
}

// ─── Settings ────────────────────────────────────────────────────────────────

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("failed to resolve app config dir");
    std::fs::create_dir_all(&dir).ok();
    dir.join("settings.json")
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = settings_path(&app);
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let path = settings_path(&app);
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

// ─── Resource Monitoring ──────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VmStats {
    pub cpu_usage: String,
    pub memory_used: String,
    pub memory_total: String,
    pub disk_used: String,
    pub disk_total: String,
}

/// Get VM resource stats via `colima ssh` to read real usage from the VM.
#[tauri::command]
pub async fn get_vm_stats(profile: String) -> Result<VmStats, String> {
    // Get config (cpu count, total mem, total disk) from colima status --json
    let status_out = cmd("colima")
        .args(["status", "--profile", &profile, "--json"])
        .output()
        .await
        .map_err(|e| format!("colima not found: {}", e))?;

    if !status_out.status.success() {
        let stderr = String::from_utf8_lossy(&status_out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`colima status` failed (status {})", status_out.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }

    let cfg: serde_json::Value = serde_json::from_slice(&status_out.stdout)
        .map_err(|e| format!("failed to parse colima status JSON: {}", e))?;

    let total_mem_bytes = cfg["memory"].as_u64().unwrap_or(0);
    let total_disk_bytes = cfg["disk"].as_u64().unwrap_or(0);

    // SSH into the VM to get live usage: free -m + df -h /
    let ssh_out = cmd("colima")
        .args(["ssh", "--profile", &profile, "--", "sh", "-c",
            "free -m | awk '/^Mem:/{print $3}'; df -h / | awk 'NR==2{print $3}'"
        ])
        .output()
        .await
        .map_err(|e| format!("colima ssh failed: {}", e))?;

    let ssh_str = String::from_utf8_lossy(&ssh_out.stdout);
    let lines: Vec<&str> = ssh_str.trim().lines().collect();

    let mem_used_mb: u64 = lines.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let disk_used = lines.get(1).unwrap_or(&"?").to_string();

    fn fmt_gib(bytes: u64) -> String {
        let gib = bytes as f64 / 1_073_741_824.0;
        if gib >= 10.0 { format!("{:.0} GiB", gib) } else { format!("{:.1} GiB", gib) }
    }

    fn fmt_mem_mb(mb: u64) -> String {
        if mb >= 1024 {
            let gib = mb as f64 / 1024.0;
            if gib >= 10.0 { format!("{:.0} GiB", gib) } else { format!("{:.1} GiB", gib) }
        } else {
            format!("{} MiB", mb)
        }
    }

    // CPU: read /proc/loadavg for a quick 1-min load average
    let cpu_out = cmd("colima")
        .args(["ssh", "--profile", &profile, "--", "cat", "/proc/loadavg"])
        .output()
        .await
        .ok();
    let cpu_cores = cfg["cpu"].as_u64().unwrap_or(1) as f64;
    let cpu_usage = cpu_out
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).to_string();
            s.split_whitespace().next()?.parse::<f64>().ok()
        })
        .map(|load| {
            let pct = (load / cpu_cores * 100.0).min(100.0);
            format!("{:.0}%", pct)
        })
        .unwrap_or_else(|| "—".to_string());

    Ok(VmStats {
        cpu_usage,
        memory_used: fmt_mem_mb(mem_used_mb),
        memory_total: fmt_gib(total_mem_bytes),
        disk_used,
        disk_total: fmt_gib(total_disk_bytes),
    })
}

// ─── Container Stats ──────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStats {
    #[serde(rename(deserialize = "ID"), default)]
    pub id: String,
    #[serde(rename(deserialize = "Name"), default)]
    pub name: String,
    #[serde(rename(deserialize = "CPUPerc"), default)]
    pub cpu_percent: String,
    #[serde(rename(deserialize = "MemUsage"), default)]
    pub memory_usage: String,
    #[serde(rename(deserialize = "MemPerc"), default)]
    pub memory_limit: String,
    #[serde(rename(deserialize = "NetIO"), default)]
    pub net_io: String,
    #[serde(rename(deserialize = "BlockIO"), default)]
    pub block_io: String,
}

/// Get live container resource stats via `docker stats --no-stream`.
#[tauri::command]
pub async fn get_container_stats(profile: String) -> Result<Vec<ContainerStats>, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "stats", "--no-stream", "--format", "{{json .}}"])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        return Ok(vec![]);
    }

    let mut stats = Vec::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Ok(s) = serde_json::from_str::<ContainerStats>(line) {
            stats.push(s);
        }
    }
    Ok(stats)
}

// ─── Container Exec ───────────────────────────────────────────────────────────

/// Open a new Terminal window with a shell into the container.
/// Uses `std::process::Command` with `.spawn()` so it doesn't block.
#[tauri::command]
pub async fn container_exec(profile: String, container_id: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    let docker_cmd = format!(
        "docker --context {} exec -it {} /bin/sh",
        context, container_id
    );

    std::process::Command::new("open")
        .args(["-a", "Terminal"])
        .env("PATH", EXTRA_PATH)
        .spawn()
        .map_err(|e| format!("failed to open Terminal: {}", e))?;

    // Use osascript to open a new Terminal window and run the docker exec command
    std::process::Command::new("osascript")
        .args([
            "-e",
            &format!(
                "tell application \"Terminal\" to do script \"{}\"",
                docker_cmd
            ),
        ])
        .env("PATH", EXTRA_PATH)
        .spawn()
        .map_err(|e| format!("failed to run docker exec in Terminal: {}", e))?;

    Ok(())
}

// ─── Image Pull ───────────────────────────────────────────────────────────────

/// Pull a Docker image, streaming output as `log-line` events.
#[tauri::command]
pub async fn pull_image(app: AppHandle, profile: String, image: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    run_streaming(
        app,
        "docker",
        vec![
            "--context".into(),
            context,
            "pull".into(),
            image,
        ],
        profile,
    )
    .await
}

// ─── Container Inspect ────────────────────────────────────────────────────────

/// Run `docker inspect` on a container and return the raw JSON.
#[tauri::command]
pub async fn inspect_container(
    profile: String,
    container_id: String,
) -> Result<serde_json::Value, String> {
    let context = profile_to_context(&profile);
    let out = cmd("docker")
        .args(["--context", &context, "inspect", &container_id])
        .output()
        .await
        .map_err(|e| format!("docker not found: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("`docker inspect` failed (status {})", out.status.code().unwrap_or(-1))
        } else {
            stderr
        });
    }

    let value: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("failed to parse docker inspect JSON: {}", e))?;

    Ok(value)
}

// ─── Tray helpers (non-command wrappers) ──────────────────────────────────────

/// Start an already-configured instance from the tray (uses existing colima config).
pub async fn start_instance_simple(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec!["start".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
}

/// Stop an instance from the tray.
pub async fn stop_instance_simple(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec!["stop".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
}

/// Restart an instance from the tray.
pub async fn restart_instance_simple(app: AppHandle, profile: String) -> Result<(), String> {
    run_streaming(
        app,
        "colima",
        vec!["restart".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
}

// ─── Auto-update check ───────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub release_notes: String,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION");

    let client = reqwest::Client::builder()
        .user_agent("colima-manager")
        .build()
        .map_err(|e| format!("failed to create HTTP client: {}", e))?;

    let resp = client
        .get("https://api.github.com/repos/thedonmon/colima-tauri-ui/releases/latest")
        .send()
        .await
        .map_err(|e| format!("failed to fetch releases: {}", e))?;

    if resp.status().as_u16() == 404 {
        // No releases published yet
        return Ok(UpdateInfo {
            current_version: current.to_string(),
            latest_version: current.to_string(),
            has_update: false,
            release_url: String::new(),
            release_notes: String::new(),
        });
    }

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned status {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse response: {}", e))?;

    let latest = data["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    let release_url = data["html_url"].as_str().unwrap_or("").to_string();
    let release_notes = data["body"].as_str().unwrap_or("").to_string();

    let has_update = !latest.is_empty() && latest != current;

    Ok(UpdateInfo {
        current_version: current.to_string(),
        latest_version: if latest.is_empty() { current.to_string() } else { latest },
        has_update,
        release_url,
        release_notes,
    })
}
