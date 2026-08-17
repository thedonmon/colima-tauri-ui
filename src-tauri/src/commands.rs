use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Output, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::task::AbortHandle;

// ─── Watcher State ────────────────────────────────────────────────────────────

/// Holds abort handles for all background watcher tasks, keyed by profile name.
/// The colima status poller is stored under the key "__poller__".
pub struct WatcherState {
    pub handles: Mutex<HashMap<String, AbortHandle>>,
    /// PIDs of spawned `colima model serve` children, keyed the same as `handles`
    /// (e.g. "model-serve:<profile>"), so they can be killed directly on stop/replace
    /// instead of relying on `pkill` pattern-matching the profile name.
    pub serve_pids: Mutex<HashMap<String, u32>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
            serve_pids: Mutex::new(HashMap::new()),
        }
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

/// Timeout for one-shot CLI calls. Anything slower than this means docker or the
/// VM is wedged, and waiting longer only lets callers queue up behind it.
const CMD_TIMEOUT: Duration = Duration::from_secs(10);

/// Timeout for calls that legitimately take a while (prune sweeps, model pulls).
const CMD_TIMEOUT_SLOW: Duration = Duration::from_secs(300);

/// Children are spawned with `kill_on_drop` so that dropping the future — which is
/// exactly what a timeout does — actually terminates the process. Tokio defaults
/// this to `false`, so a timed-out `.output()` used to leave the child running
/// forever. Those orphans stay parented to this app, so macOS bills their memory
/// to Colima Manager.
fn cmd(program: &str) -> Command {
    let mut c = Command::new(program);
    c.env("PATH", EXTRA_PATH);
    c.kill_on_drop(true);
    c
}

/// Run a command to completion under a hard timeout.
///
/// Every one-shot CLI call goes through here. Without a timeout a wedged Docker
/// daemon leaves `.output()` pending forever, and because the frontend re-fires
/// these on every Docker event (health-check exec events alone are ~1/s), hung
/// `docker` children stacked up without bound until the app's memory ran away.
async fn run_timeout<I, S>(program: &str, args: I, timeout: Duration) -> Result<Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut c = cmd(program);
    c.args(args);
    match tokio::time::timeout(timeout, c.output()).await {
        Err(_) => Err(format!(
            "`{}` timed out after {}s — the daemon or VM is not responding",
            program,
            timeout.as_secs()
        )),
        // Keeps the "<program> not found" wording that the frontend's
        // `isNotFound` check keys on to show the setup guide.
        Ok(Err(e)) => Err(format!("{} not found ({})", program, e)),
        Ok(Ok(out)) => Ok(out),
    }
}

/// `run_timeout` with the standard timeout.
async fn run<I, S>(program: &str, args: I) -> Result<Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    run_timeout(program, args, CMD_TIMEOUT).await
}

/// Returns stderr if the command failed, else `Ok(stdout)` — the shape most of
/// the docker wrappers below want.
fn stdout_or_stderr(out: Output, what: &str) -> Result<String, String> {
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("`{}` failed (status {})", what, out.status.code().unwrap_or(-1))
    } else {
        stderr
    })
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
    let out = run("colima", ["list"]).await?;

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

// ─── Crash Recovery ───────────────────────────────────────────────────────────

async fn read_pid_file(path: &str) -> Option<u32> {
    tokio::fs::read_to_string(path).await.ok()?.trim().parse().ok()
}

/// PIDs whose full command line matches `pattern`.
async fn pgrep(pattern: &str) -> Vec<u32> {
    let Ok(out) = run("pgrep", ["-f", pattern]).await else {
        return Vec::new();
    };
    String::from_utf8_lossy(&out.stdout)
        .split_whitespace()
        .filter_map(|s| s.parse().ok())
        .collect()
}

async fn pid_alive(pid: u32) -> bool {
    run("kill", ["-0", &pid.to_string()])
        .await
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// SIGTERM, then SIGKILL if it is still there. Returns whether the process died.
async fn terminate_pid(pid: u32) -> bool {
    kill_pid(pid).await;
    tokio::time::sleep(Duration::from_millis(700)).await;
    if !pid_alive(pid).await {
        return true;
    }
    let _ = run("kill", ["-KILL", &pid.to_string()]).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    !pid_alive(pid).await
}

/// Report a recovery step to the log drawer, which is already open at this point.
fn report(app: &AppHandle, profile: &str, line: impl Into<String>, is_error: bool) {
    let _ = app.emit(
        "log-line",
        LogLine {
            profile: profile.to_string(),
            line: line.into(),
            is_error,
        },
    );
}

/// One leftover process that recovery has judged to be an orphan.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StaleProcess {
    /// "usernet" | "hostagent" | "qemu"
    pub kind: String,
    pub pid: u32,
    /// Human-readable reason this counts as stale.
    pub detail: String,
}

/// Lima instance directory names under `~/.colima/_lima` (colima, colima-ai, …).
async fn lima_instances(home: &str) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(mut dirs) = tokio::fs::read_dir(format!("{}/.colima/_lima", home)).await else {
        return out;
    };
    while let Ok(Some(e)) = dirs.next_entry().await {
        let name = e.file_name().to_string_lossy().to_string();
        // Skip Lima's own `_config` / `_disks` / `_networks` bookkeeping dirs.
        if name.starts_with("colima") && e.path().is_dir() {
            out.push(name);
        }
    }
    out
}

/// Whether an instance still has live processes owning its sockets.
async fn instance_is_live(home: &str, instance: &str) -> bool {
    for pidfile in ["vz.pid", "ha.pid"] {
        let path = format!("{}/.colima/_lima/{}/{}", home, instance, pidfile);
        if let Some(pid) = read_pid_file(&path).await {
            if pid_alive(pid).await {
                return true;
            }
        }
    }
    false
}

/// Whether any Colima instance on this machine is still up.
async fn any_instance_live(home: &str) -> bool {
    for instance in lima_instances(home).await {
        if instance_is_live(home, &instance).await {
            return true;
        }
    }
    false
}

/// Find leftover processes from an unclean shutdown, without touching anything.
///
/// Nothing under Lima is safe to touch while a VM is up, so this reports only once
/// every instance is down — which is also the only moment cleaning up helps.
///
/// That gate is the whole safety property. `limactl usernet` is shared by every
/// instance and runs as a live *pair*, while Lima's pidfile names only one of
/// them. It is tempting to treat the unnamed process as a provable orphan, but it
/// is not one: killing it tears down networking for the running VM and takes
/// `docker.sock` with it, leaving Colima reporting "Running" with no connectivity.
///
/// Once everything is stopped the question disappears — nothing under Lima should
/// still be running, and usernet is recreated by the next `colima start`.
async fn scan_stale(home: &str) -> Vec<StaleProcess> {
    if any_instance_live(home).await {
        return Vec::new();
    }

    let mut found = Vec::new();

    for pid in pgrep("limactl usernet").await {
        found.push(StaleProcess {
            kind: "usernet".into(),
            pid,
            detail: "still running with every Colima instance stopped".into(),
        });
    }

    for instance in lima_instances(home).await {
        // Matched on the `--pidfile` path so "colima-dev" can never catch "colima-dev2".
        let ha_path = format!("{}/.colima/_lima/{}/ha.pid", home, instance);
        for pid in pgrep(&format!("limactl hostagent .*--pidfile {}", ha_path)).await {
            found.push(StaleProcess {
                kind: "hostagent".into(),
                pid,
                detail: format!("{} hostagent running while the instance is stopped", instance),
            });
        }

        // QEMU-backed VMs. vz instances have no qemu process, so this is a no-op there.
        for pid in pgrep(&format!("qemu.*{}", instance)).await {
            found.push(StaleProcess {
                kind: "qemu".into(),
                pid,
                detail: format!("stale qemu process for {}", instance),
            });
        }
    }

    found
}

/// Read-only check so the UI can offer recovery *before* a start is attempted,
/// instead of only after one has already failed.
#[tauri::command]
pub async fn scan_stale_processes() -> Result<Vec<StaleProcess>, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME env var not set".to_string())?;
    Ok(scan_stale(&home).await)
}

/// Recover from an unclean shutdown (host crash, force power-off).
///
/// Kills only what [`scan_stale`] could prove is an orphan, and removes an
/// instance's sockets only once nothing is left alive to own them — deleting a
/// healthy VM's `ssh.sock` would break it. Every decision is emitted as a log line
/// so the outcome is inspectable rather than a silent nuke.
#[tauri::command]
pub async fn kill_stale_processes(app: AppHandle, profile: String) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME env var not set".to_string())?;
    let mut cleaned: Vec<String> = Vec::new();

    report(&app, &profile, "Scanning for leftovers from an unclean shutdown...", false);

    let stale = scan_stale(&home).await;
    if stale.is_empty() {
        report(&app, &profile, "  no orphaned Lima processes found", false);
    }
    for s in &stale {
        report(&app, &profile, format!("  orphaned {} pid {} — {} — killing", s.kind, s.pid, s.detail), false);
        if terminate_pid(s.pid).await {
            cleaned.push(format!("{} {}", s.kind, s.pid));
        } else {
            report(&app, &profile, format!("  could not kill {} pid {}", s.kind, s.pid), true);
        }
    }

    // Sockets, per instance, only where nothing is left alive to own them.
    for instance in lima_instances(&home).await {
        if instance_is_live(&home, &instance).await {
            report(&app, &profile, format!("  {} still has live processes — leaving its sockets alone", instance), false);
            continue;
        }
        let dir = format!("{}/.colima/_lima/{}", home, instance);
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else { continue };
        while let Ok(Some(e)) = entries.next_entry().await {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("sock") {
                continue;
            }
            if tokio::fs::remove_file(&path).await.is_ok() {
                report(&app, &profile, format!("  removed stale socket {}", path.display()), false);
                cleaned.push(format!("socket {}", path.display()));
            }
        }
    }

    let summary = if cleaned.is_empty() {
        "Nothing stale found — the problem is something else.".to_string()
    } else {
        format!("Cleaned up {} item(s). Try starting again.", cleaned.len())
    };
    report(&app, &profile, &summary, false);
    Ok(summary)
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
        .kill_on_drop(true)
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
    let out = run("colima", ["version"]).await?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[tauri::command]
pub async fn get_docker_contexts() -> Result<Vec<DockerContext>, String> {
    let out = run(
        "docker",
        ["context", "ls", "--format", "{{.Name}}\t{{.Current}}\t{{.DockerEndpoint}}"],
    )
    .await?;

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

    let out = run("docker", ["--context", &context, &action, &container_id]).await?;
    stdout_or_stderr(out, &format!("docker {}", action))?;
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

    let out = run(
        "docker",
        ["--context", &context, "logs", "--tail", &tail_str, &container_id],
    )
    .await?;

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
    let out = run("docker", &args).await?;

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
    let out = run(
        "docker",
        ["--context", &context, "images", "--format", "{{json .}}"],
    )
    .await?;

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
    // Pruning a large image cache legitimately outruns the standard timeout.
    let out = run_timeout(
        "docker",
        ["--context", &context, "image", "prune", "--force"],
        CMD_TIMEOUT_SLOW,
    )
    .await?;
    stdout_or_stderr(out, "docker image prune")
}

/// Remove an image by ID from a Colima instance's Docker context.
#[tauri::command]
pub async fn remove_image(profile: String, image_id: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    let out = run_timeout(
        "docker",
        ["--context", &context, "rmi", &image_id],
        CMD_TIMEOUT_SLOW,
    )
    .await?;
    stdout_or_stderr(out, "docker rmi")?;
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
    let out = run(
        "docker",
        ["--context", &context, "volume", "ls", "--format", "{{json .}}"],
    )
    .await?;

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
    let out = run_timeout(
        "docker",
        ["--context", &context, "volume", "prune", "--force"],
        CMD_TIMEOUT_SLOW,
    )
    .await?;
    stdout_or_stderr(out, "docker volume prune")
}

/// Remove a named volume from a Colima instance's Docker context.
#[tauri::command]
pub async fn remove_volume(profile: String, volume_name: String) -> Result<(), String> {
    let context = profile_to_context(&profile);
    let out = run(
        "docker",
        ["--context", &context, "volume", "rm", &volume_name],
    )
    .await?;
    stdout_or_stderr(out, "docker volume rm")?;
    Ok(())
}

// ─── Colima AI Models ─────────────────────────────────────────────────────────

/// Run `colima model setup` for a given profile.
/// If the profile is already krunkit, runs setup directly.
/// If not, creates a new krunkit profile with the given name and resources.
#[tauri::command]
pub async fn colima_model_setup(
    app: AppHandle,
    profile: String,
    is_krunkit: bool,
    new_profile: Option<String>,
    cpu: Option<u32>,
    memory: Option<u32>,
    disk: Option<u32>,
) -> Result<(), String> {
    let target_profile = if is_krunkit {
        profile
    } else {
        // Check if krunkit is installed before trying to create a krunkit profile
        let krunkit_check = run("which", ["krunkit"]).await;
        if !krunkit_check.map(|o| o.status.success()).unwrap_or(false) {
            return Err("krunkit is not installed. Run: brew tap slp/krunkit && brew install krunkit".to_string());
        }
        let ai_profile = new_profile.unwrap_or_else(|| "ai".to_string());
        let mut start_args = vec![
            "start".to_string(),
            "--runtime".to_string(),
            "docker".to_string(),
            "--vm-type".to_string(),
            "krunkit".to_string(),
            "--cpu".to_string(),
            cpu.unwrap_or(4).to_string(),
            "--memory".to_string(),
            memory.unwrap_or(8).to_string(),
            "--disk".to_string(),
            disk.unwrap_or(60).to_string(),
            "--profile".to_string(),
            ai_profile.clone(),
        ];
        // Add model-runner flag if colima supports it
        start_args.extend(["--model-runner".to_string(), "docker".to_string()]);
        let _ = run_streaming(app.clone(), "colima", start_args, ai_profile.clone()).await;
        ai_profile
    };

    let mut setup_args = vec!["model".to_string(), "setup".to_string()];
    if target_profile != "default" {
        setup_args.extend(["--profile".to_string(), target_profile.clone()]);
    }
    run_streaming(app, "colima", setup_args, target_profile).await
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

/// Send SIGTERM to a PID directly. Used to kill `colima model serve` children —
/// `pkill -f` pattern-matching on the profile name doesn't work for the default
/// profile, since its command line never contains "default" (see below).
async fn kill_pid(pid: u32) {
    let _ = run("kill", ["-TERM", &pid.to_string()]).await;
}

/// Best-effort fallback for grandchild processes `colima model serve` may spawn
/// itself (killing the direct child PID above may not be enough). Matches on the
/// command line the same way `colima` itself would distinguish profiles: named
/// profiles pass `--profile <name>`, while the default profile passes no
/// `--profile` flag at all. This keeps the default-profile match from ever
/// catching a named-profile server (and vice versa).
async fn pkill_model_serve(profile: &str) {
    let out = run("pgrep", ["-f", "colima model serve"]).await;
    let Ok(out) = out else { return };

    // Collect first: `pgrep`'s stdout borrows `out`, and awaiting per-PID below
    // would otherwise hold that borrow across the await points.
    let pids: Vec<String> = String::from_utf8_lossy(&out.stdout)
        .split_whitespace()
        .map(str::to_string)
        .collect();

    for pid_str in pids {
        let Ok(pid) = pid_str.parse::<u32>() else { continue };
        let Ok(ps_out) = run("ps", ["-p", &pid_str, "-o", "command="]).await else {
            continue;
        };
        let command_line = String::from_utf8_lossy(&ps_out.stdout);
        // Token-wise match so profile "dev" can never match "--profile dev2".
        let matches = if profile == "default" {
            !command_line.contains("--profile")
        } else {
            command_line
                .split_whitespace()
                .collect::<Vec<_>>()
                .windows(2)
                .any(|w| w[0] == "--profile" && w[1] == profile)
        };
        if matches {
            kill_pid(pid).await;
        }
    }
}

/// Serve a model as an OpenAI-compatible API server (long-running background task).
/// Stores abort handle so it can be stopped via `colima_model_stop_serve`, and the
/// spawned child's PID so it can be killed directly on stop/replace.
#[tauri::command]
pub async fn colima_model_serve(
    app: AppHandle,
    profile: String,
    model: String,
    port: Option<u16>,
) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let key = format!("model-serve:{}", profile);

    // Stop any existing serve for this profile — abort the task AND kill the
    // process itself, otherwise the old server (potentially GBs of RAM) is
    // orphaned every time a profile's serve is replaced.
    if let Some(handle) = state.handles.lock().unwrap().remove(&key) {
        handle.abort();
    }
    let old_pid = state.serve_pids.lock().unwrap().remove(&key);
    if let Some(pid) = old_pid {
        kill_pid(pid).await;
    }
    // Also sweep grandchild server processes (and any stale server left over
    // from a previous app session) before starting the replacement.
    pkill_model_serve(&profile).await;

    let mut args = vec!["model".to_string(), "serve".to_string(), model];
    if let Some(p) = port {
        args.extend(["--".to_string(), "--port".to_string(), p.to_string()]);
    }
    if profile != "default" {
        args.extend(["--profile".to_string(), profile.clone()]);
    }

    // Spawned inline (rather than via `run_streaming`) so we can read the
    // child's PID right after spawn and record it before this command returns.
    let mut child = cmd("colima")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn `colima`: {}", e))?;

    if let Some(pid) = child.id() {
        state.serve_pids.lock().unwrap().insert(key.clone(), pid);
    }

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

    let handle = tokio::spawn(async move {
        let _ = child.wait().await;
    });

    state
        .handles
        .lock()
        .unwrap()
        .insert(key, handle.abort_handle());

    Ok(())
}

/// Stop a running model serve process.
#[tauri::command]
pub async fn colima_model_stop_serve(app: AppHandle, profile: String) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let key = format!("model-serve:{}", profile);

    let handle = state.handles.lock().unwrap().remove(&key);
    let pid = state.serve_pids.lock().unwrap().remove(&key);

    if handle.is_some() || pid.is_some() {
        if let Some(handle) = handle {
            handle.abort();
        }
        if let Some(pid) = pid {
            kill_pid(pid).await;
        }
        // Also sweep for any lingering `colima model serve` process (e.g. a
        // grandchild spawned by `colima` itself) using a pattern that can't
        // cross-match the default profile with a named one.
        pkill_model_serve(&profile).await;
    }
    Ok(())
}

/// Pull a model without running it.
#[tauri::command]
pub async fn colima_model_pull(
    app: AppHandle,
    profile: String,
    model: String,
) -> Result<(), String> {
    let mut args = vec!["model".to_string(), "pull".to_string(), model];
    if profile != "default" {
        args.extend(["--profile".to_string(), profile.clone()]);
    }
    run_streaming(app, "colima", args, profile).await
}

/// List downloaded models for a profile.
#[tauri::command]
pub async fn colima_model_list(profile: String) -> Result<String, String> {
    let mut args = vec!["model".to_string(), "list".to_string()];
    if profile != "default" {
        args.extend(["--profile".to_string(), profile]);
    }
    let out = run("colima", &args).await?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(stderr);
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
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
            .kill_on_drop(true)
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
            .kill_on_drop(true)
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(_) => return,
        };

        // Read both streams in this single task (whose AbortHandle is stored below)
        // so that `stop_container_log_stream`'s abort actually stops the reading —
        // previously stdout/stderr were read in separate inner tasks that outlived
        // the abort of this outer task, causing duplicated log lines after
        // reopening the drawer.
        let mut stdout_lines = child.stdout.take().map(|s| BufReader::new(s).lines());
        let mut stderr_lines = child.stderr.take().map(|s| BufReader::new(s).lines());

        let mut stdout_done = stdout_lines.is_none();
        let mut stderr_done = stderr_lines.is_none();

        while !stdout_done || !stderr_done {
            tokio::select! {
                line = async { stdout_lines.as_mut().unwrap().next_line().await }, if !stdout_done => {
                    match line {
                        Ok(Some(text)) => {
                            let _ = app.emit(
                                "container-log-line",
                                ContainerLogLineEvent { container_id: cid.clone(), text, is_err: false },
                            );
                        }
                        _ => stdout_done = true,
                    }
                }
                line = async { stderr_lines.as_mut().unwrap().next_line().await }, if !stderr_done => {
                    match line {
                        Ok(Some(text)) => {
                            let _ = app.emit(
                                "container-log-line",
                                ContainerLogLineEvent { container_id: cid.clone(), text, is_err: true },
                            );
                        }
                        _ => stderr_done = true,
                    }
                }
            }
        }

        // Both streams hit EOF naturally (or the child died) — reap it. If this
        // task is aborted instead, `.kill_on_drop(true)` above kills the child.
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

            if let Ok(out) = run("colima", ["list"]).await {
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
    let status_out = run("colima", ["status", "--profile", &profile, "--json"]).await?;
    if !status_out.status.success() {
        return Err(stdout_or_stderr(status_out, "colima status").unwrap_err());
    }

    let cfg: serde_json::Value = serde_json::from_slice(&status_out.stdout)
        .map_err(|e| format!("failed to parse colima status JSON: {}", e))?;

    let total_mem_bytes = cfg["memory"].as_u64().unwrap_or(0);
    let total_disk_bytes = cfg["disk"].as_u64().unwrap_or(0);

    // SSH into the VM to get live usage: free -m + df -h /
    let ssh_out = run(
        "colima",
        [
            "ssh", "--profile", &profile, "--", "sh", "-c",
            "free -m | awk '/^Mem:/{print $3}'; df -h / | awk 'NR==2{print $3}'",
        ],
    )
    .await?;

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
    let cpu_out = run(
        "colima",
        ["ssh", "--profile", &profile, "--", "cat", "/proc/loadavg"],
    )
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
    let out = run(
        "docker",
        ["--context", &context, "stats", "--no-stream", "--format", "{{json .}}"],
    )
    .await?;

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
    let out = run("docker", ["--context", &context, "inspect", &container_id]).await?;
    if !out.status.success() {
        return Err(stdout_or_stderr(out, "docker inspect").unwrap_err());
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the runaway-memory bug.
    ///
    /// Tokio defaults `kill_on_drop` to `false`, so a timed-out `.output()` used
    /// to leave its child running forever — still parented to this app, so macOS
    /// billed the memory to Colima Manager. The frontend re-fires these calls on
    /// every Docker event, so a wedged daemon grew the orphan pile without bound.
    /// `cmd()` now sets `kill_on_drop`, which means the timeout must reap it.
    #[tokio::test]
    async fn timed_out_command_kills_its_child() {
        // A distinctive duration so the pgrep below can't match anything else.
        const MARKER: &str = "4242";

        let err = run_timeout("sleep", [MARKER], Duration::from_millis(200))
            .await
            .expect_err("expected the call to time out");
        assert!(err.contains("timed out"), "unexpected error: {}", err);

        // Give the SIGKILL a moment to land before checking.
        tokio::time::sleep(Duration::from_millis(500)).await;

        let survivors = run("pgrep", ["-f", &format!("^sleep {}$", MARKER)])
            .await
            .expect("pgrep should run");
        assert!(
            survivors.stdout.is_empty(),
            "timed-out child survived as pid(s): {}",
            String::from_utf8_lossy(&survivors.stdout).trim()
        );
    }

    /// The timeout must not fire for a command that finishes in time.
    #[tokio::test]
    async fn fast_command_returns_its_output() {
        let out = run("echo", ["hello"]).await.expect("echo should succeed");
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hello");
    }

    /// A PID above macOS's PID_MAX, so `kill -0` can never find it.
    const DEAD_PID: &str = "999999";

    async fn fake_home(tag: &str) -> std::path::PathBuf {
        let home = std::env::temp_dir().join(format!("cm-test-{}-{}", std::process::id(), tag));
        tokio::fs::remove_dir_all(&home).await.ok();
        tokio::fs::create_dir_all(home.join(".colima/_lima/colima")).await.unwrap();
        home
    }

    /// Regression test for the outage this recovery path caused.
    ///
    /// It used to treat the `limactl usernet` process that no pidfile named as a
    /// provable orphan. It is not one — usernet runs as a live pair, so killing
    /// the unnamed process tore down networking for the *running* VM and killed
    /// docker.sock. Nothing may be reported while any instance is still up.
    #[tokio::test]
    async fn scan_reports_nothing_while_an_instance_is_live() {
        let home = fake_home("live").await;
        // Our own PID is unambiguously alive.
        tokio::fs::write(
            home.join(".colima/_lima/colima/ha.pid"),
            format!("{}\n", std::process::id()),
        )
        .await
        .unwrap();

        let h = home.to_string_lossy().to_string();
        assert!(instance_is_live(&h, "colima").await, "own PID must read as live");
        assert!(any_instance_live(&h).await);
        assert!(
            scan_stale(&h).await.is_empty(),
            "a live instance must veto every finding, however stale it looks"
        );

        tokio::fs::remove_dir_all(&home).await.ok();
    }

    /// The gate must actually open once everything is stopped, or recovery is
    /// unreachable in exactly the case it exists for.
    #[tokio::test]
    async fn stopped_instance_does_not_read_as_live() {
        let home = fake_home("dead").await;
        tokio::fs::write(home.join(".colima/_lima/colima/ha.pid"), DEAD_PID)
            .await
            .unwrap();

        let h = home.to_string_lossy().to_string();
        assert!(!instance_is_live(&h, "colima").await);
        assert!(!any_instance_live(&h).await);

        tokio::fs::remove_dir_all(&home).await.ok();
    }

    /// Lima's own bookkeeping dirs must not be mistaken for instances.
    #[tokio::test]
    async fn lima_instances_skips_bookkeeping_dirs() {
        let home = fake_home("dirs").await;
        let lima = home.join(".colima/_lima");
        for d in ["_config", "_disks", "_networks", "colima-ai"] {
            tokio::fs::create_dir_all(lima.join(d)).await.unwrap();
        }

        let mut found = lima_instances(&home.to_string_lossy()).await;
        found.sort();
        assert_eq!(found, vec!["colima".to_string(), "colima-ai".to_string()]);

        tokio::fs::remove_dir_all(&home).await.ok();
    }
}

