use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Prepend common Homebrew and system paths so GUI app finds colima/docker.
const EXTRA_PATH: &str =
    "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    c.env("PATH", EXTRA_PATH);
    c
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
        vec!["prune".into(), "--profile".into(), profile.clone()],
        profile,
    )
    .await
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
pub async fn get_containers_by_context(context: String) -> Result<Vec<DockerContainer>, String> {
    fetch_containers(&context).await
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
    let allowed = ["start", "stop", "restart", "pause", "unpause"];
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
async fn fetch_containers(context: &str) -> Result<Vec<DockerContainer>, String> {
    let out = cmd("docker")
        .args(["--context", context, "ps", "--format", "{{json .}}"])
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
        if let Ok(c) = serde_json::from_str::<DockerContainer>(line) {
            containers.push(c);
        }
    }
    Ok(containers)
}

/// Returns Docker containers running inside a Colima instance.
/// Colima exposes each profile as a Docker context:
///   default profile → "colima"
///   named profile   → "colima-<profile>"
#[tauri::command]
pub async fn get_containers(profile: String) -> Result<Vec<DockerContainer>, String> {
    let context = if profile == "default" {
        "colima".to_string()
    } else {
        format!("colima-{}", profile)
    };
    fetch_containers(&context).await
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
