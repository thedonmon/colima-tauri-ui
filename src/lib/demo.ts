/**
 * Demo mode: launch with `VITE_DEMO=1` (or `make demo`) to run the real app
 * shell against believable mock data — no colima or docker command ever runs,
 * so screenshots never expose real infrastructure.
 *
 * Every custom Tauri command is intercepted; `plugin:*` calls (events, window
 * chrome, drag) pass through to the real runtime so the window behaves
 * normally. Mutating commands edit the in-memory fixtures, so start/stop/
 * pause/remove all "work" for demo purposes.
 */
import { emit } from "@tauri-apps/api/event";
import type {
  ColimaInstance,
  ContainerStats,
  DockerContainer,
  DockerContext,
  DockerImage,
  DockerVolume,
  StaleProcess,
  VmStats,
} from "../types";

export const DEMO_MODE = import.meta.env.VITE_DEMO === "1";

/* ─── Fixtures ─── */

const instances: ColimaInstance[] = [
  { profile: "default", status: "Running", arch: "aarch64", cpus: "4", memory: "8GiB", disk: "60GiB", runtime: "docker", address: "192.168.106.2" },
  { profile: "ai", status: "Running", arch: "aarch64", cpus: "8", memory: "16GiB", disk: "100GiB", runtime: "docker", address: "192.168.106.3" },
  { profile: "staging", status: "Stopped", arch: "aarch64", cpus: "2", memory: "4GiB", disk: "40GiB", runtime: "docker", address: "—" },
];

const vmTypes: Record<string, string> = { default: "vz", ai: "krunkit", staging: "vz" };

const containersByProfile: Record<string, DockerContainer[]> = {
  default: [
    { id: "f3a1c2d94b01", names: "webapp-api", image: "ghcr.io/acme/webapp-api:1.4.2", status: "Up 3 days (healthy)", ports: "0.0.0.0:8080->8080/tcp", composeProject: "webapp", composeService: "api" },
    { id: "9b82e14a77c2", names: "webapp-postgres", image: "postgres:16-alpine", status: "Up 3 days (healthy)", ports: "5432/tcp", composeProject: "webapp", composeService: "db" },
    { id: "5d20fa6c3e88", names: "webapp-redis", image: "redis:7-alpine", status: "Up 3 days", ports: "6379/tcp", composeProject: "webapp", composeService: "redis" },
    { id: "a7c94d1052ef", names: "nginx-proxy", image: "nginx:1.27-alpine", status: "Up 5 days", ports: "0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp", composeProject: "", composeService: "" },
    { id: "c1e88f39ab04", names: "grafana", image: "grafana/grafana:11.2.0", status: "Up 26 hours", ports: "0.0.0.0:3001->3000/tcp", composeProject: "", composeService: "" },
    { id: "2f6b0d8ec913", names: "backup-runner", image: "alpine:3.20", status: "Exited (0) 5 hours ago", ports: "", composeProject: "", composeService: "" },
  ],
  ai: [
    { id: "e49a27b3cd10", names: "open-webui", image: "ghcr.io/open-webui/open-webui:main", status: "Up 2 hours", ports: "0.0.0.0:3000->8080/tcp", composeProject: "", composeService: "" },
  ],
};

const desktopContainers: DockerContainer[] = [
  { id: "77d4e2a1f0b6", names: "registry", image: "registry:2", status: "Up 2 weeks", ports: "0.0.0.0:5000->5000/tcp", composeProject: "", composeService: "" },
  { id: "3c91ab5e64d7", names: "minio", image: "minio/minio:latest", status: "Up 3 days (Paused)", ports: "0.0.0.0:9000->9000/tcp", composeProject: "", composeService: "" },
];

let images: DockerImage[] = [
  { id: "b1c2d3e4f5a6b7c8", repository: "ghcr.io/acme/webapp-api", tag: "1.4.2", size: "182MB", created_since: "3 days ago" },
  { id: "c2d3e4f5a6b7c8d9", repository: "postgres", tag: "16-alpine", size: "243MB", created_since: "2 weeks ago" },
  { id: "d3e4f5a6b7c8d9e0", repository: "redis", tag: "7-alpine", size: "41.4MB", created_since: "2 weeks ago" },
  { id: "e4f5a6b7c8d9e0f1", repository: "nginx", tag: "1.27-alpine", size: "43.2MB", created_since: "5 weeks ago" },
  { id: "f5a6b7c8d9e0f1a2", repository: "grafana/grafana", tag: "11.2.0", size: "412MB", created_since: "6 weeks ago" },
  { id: "a6b7c8d9e0f1a2b3", repository: "alpine", tag: "3.20", size: "7.8MB", created_since: "2 months ago" },
  { id: "b7c8d9e0f1a2b3c4", repository: "<none>", tag: "<none>", size: "168MB", created_since: "3 months ago" },
];

let volumes: DockerVolume[] = [
  { name: "webapp_pgdata", driver: "local", mountpoint: "/var/lib/docker/volumes/webapp_pgdata/_data" },
  { name: "grafana-data", driver: "local", mountpoint: "/var/lib/docker/volumes/grafana-data/_data" },
  { name: "caddy_config", driver: "local", mountpoint: "/var/lib/docker/volumes/caddy_config/_data" },
];

/* ─── Stats with a random walk so sparklines draw real shapes ─── */

const statState: Record<string, { cpu: number; mem: number }> = {
  default: { cpu: 12, mem: 3.4 },
  ai: { cpu: 46, mem: 9.8 },
};

function walk(v: number, lo: number, hi: number, step: number): number {
  const next = v + (Math.random() - 0.5) * 2 * step;
  return Math.min(hi, Math.max(lo, next));
}

function vmStats(profile: string): VmStats {
  const s = statState[profile] ?? (statState[profile] = { cpu: 10, mem: 2 });
  s.cpu = walk(s.cpu, 4, profile === "ai" ? 85 : 32, 5);
  s.mem = walk(s.mem, profile === "ai" ? 8.5 : 3.0, profile === "ai" ? 13.5 : 4.8, 0.25);
  const total = profile === "ai" ? "16GiB" : "8GiB";
  const disk = profile === "ai" ? { used: "38.2G", total: "100G" } : { used: "21.4G", total: "60G" };
  return {
    cpuUsage: `${s.cpu.toFixed(1)}%`,
    memoryUsed: `${s.mem.toFixed(1)}GiB`,
    memoryTotal: total,
    diskUsed: disk.used,
    diskTotal: disk.total,
  };
}

function containerStats(profile: string): ContainerStats[] {
  return (containersByProfile[profile] ?? [])
    .filter((c) => c.status.toLowerCase().startsWith("up"))
    .map((c, i) => ({
      id: c.id,
      name: c.names,
      cpuPercent: `${(walk(2 + i, 0.1, 9, 1.5)).toFixed(2)}%`,
      memoryUsage: `${(90 + i * 60 + Math.random() * 20).toFixed(0)}MiB / 8GiB`,
      memoryLimit: "8GiB",
      netIo: `${(4 + i * 3).toFixed(1)}MB / ${(1 + i).toFixed(1)}MB`,
      blockIo: `0B / ${(2 + i * 4).toFixed(1)}MB`,
    }));
}

/* ─── Fake container log stream ─── */

const logTimers = new Map<string, ReturnType<typeof setInterval>>();

const LOG_LINES = [
  "LOG:  database system is ready to accept connections",
  "LOG:  checkpoint starting: time",
  "LOG:  checkpoint complete: wrote 42 buffers (0.3%)",
  "LOG:  connection received: host=172.18.0.4 port=51712",
  "LOG:  connection authorized: user=webapp database=webapp",
  'LOG:  automatic vacuum of table "webapp.public.jobs"',
];

function startLogStream(containerId: string) {
  stopLogStream(containerId);
  const line = (i: number, isErr = false) =>
    emit("container-log-line", {
      containerId,
      text: `${new Date().toISOString().replace("T", " ").slice(0, 19)} ${LOG_LINES[i % LOG_LINES.length]}`,
      isErr,
    });
  for (let i = 0; i < 10; i++) void line(i);
  let n = 10;
  logTimers.set(
    containerId,
    setInterval(() => void line(n++), 1800)
  );
}

function stopLogStream(containerId: string) {
  const t = logTimers.get(containerId);
  if (t) clearInterval(t);
  logTimers.delete(containerId);
}

/* ─── Fake colima command output (for the output drawer) ─── */

async function emitCommandLogs(profile: string, lines: string[]) {
  for (const line of lines) {
    await new Promise((r) => setTimeout(r, 250));
    await emit("log-line", { profile, line, isError: false });
  }
}

/* ─── Command handlers ─── */

type Handler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

const handlers: Record<string, Handler> = {
  list_instances: () => instances,
  get_version: () => "colima version 0.10.1",
  get_docker_contexts: (): DockerContext[] => [
    { name: "colima", current: true, endpoint: "unix:///Users/demo/.colima/default/docker.sock" },
    { name: "desktop-linux", current: false, endpoint: "unix:///Users/demo/.docker/run/docker.sock" },
  ],
  scan_stale_processes: (): StaleProcess[] => [],
  get_vm_type: (a) => vmTypes[String(a.profile)] ?? "vz",
  get_vm_stats: (a) => vmStats(String(a.profile)),
  get_container_stats: (a) => containerStats(String(a.profile)),

  get_containers: (a) => {
    const all = containersByProfile[String(a.profile)] ?? [];
    return a.showAll ? all : all.filter((c) => c.status.toLowerCase().startsWith("up"));
  },
  get_containers_by_context: (a) =>
    a.showAll ? desktopContainers : desktopContainers.filter((c) => c.status.toLowerCase().startsWith("up")),
  get_images: () => images,
  get_volumes: () => volumes,

  container_action: (a) => {
    const id = String(a.containerId);
    const action = String(a.action);
    for (const list of [...Object.values(containersByProfile), desktopContainers]) {
      const c = list.find((x) => x.id === id);
      if (!c) continue;
      if (action === "stop") c.status = "Exited (0) 1 second ago";
      if (action === "start" || action === "restart") c.status = "Up 1 second";
      if (action === "pause") c.status = c.status.replace(/\s*\(Paused\)/, "") + " (Paused)";
      if (action === "unpause") c.status = c.status.replace(/\s*\(Paused\)/, "");
      if (action === "rm") list.splice(list.indexOf(c), 1);
    }
    return null;
  },
  container_exec: () => null,
  remove_image: (a) => {
    images = images.filter((i) => i.id !== a.imageId);
    return null;
  },
  remove_volume: (a) => {
    volumes = volumes.filter((v) => v.name !== a.volumeName);
    return null;
  },
  prune_images: () => {
    images = images.filter((i) => i.repository !== "<none>");
    return null;
  },
  prune_volumes: () => null,
  pull_image: async () => new Promise((r) => setTimeout(r, 1500)),

  start_instance: async (a) => {
    const opts = a.options as { profile: string } | undefined;
    const profile = opts?.profile ?? "default";
    await emitCommandLogs(profile, [
      `time="${new Date().toISOString()}" level=info msg="starting colima [profile=${profile}]"`,
      'time="..." level=info msg="runtime: docker"',
      'time="..." level=info msg="starting ..." context=vm',
      'time="..." level=info msg="provisioning ..." context=docker',
      'time="..." level=info msg="starting ..." context=docker',
      "colima is running",
    ]);
    const inst = instances.find((i) => i.profile === profile);
    if (inst) inst.status = "Running";
    return null;
  },
  stop_instance: async (a) => {
    const profile = String(a.profile);
    await emitCommandLogs(profile, [
      `time="${new Date().toISOString()}" level=info msg="stopping colima [profile=${profile}]"`,
      'time="..." level=info msg="stopping ..." context=docker',
      'time="..." level=info msg="stopping ..." context=vm',
      "colima stopped",
    ]);
    const inst = instances.find((i) => i.profile === profile);
    if (inst) {
      inst.status = "Stopped";
      inst.address = "—";
    }
    return null;
  },
  restart_instance: async () => new Promise((r) => setTimeout(r, 1200)),
  delete_instance: (a) => {
    const idx = instances.findIndex((i) => i.profile === a.profile);
    if (idx >= 0) instances.splice(idx, 1);
    return null;
  },
  prune_instance: async () => new Promise((r) => setTimeout(r, 800)),
  force_stop_instance: () => null,
  kill_stale_processes: () => null,

  stream_container_logs: (a) => {
    startLogStream(String(a.containerId));
    return null;
  },
  stop_container_log_stream: (a) => {
    stopLogStream(String(a.containerId));
    return null;
  },

  read_config: () => `# ~/.colima/default/colima.yaml
cpu: 4
memory: 8
disk: 60
vmType: vz
rosetta: true
runtime: docker
autoActivate: true
network:
  address: true
mounts:
  - location: ~
    writable: true
`,
  inspect_container: () => [
    {
      Config: {
        Env: [
          "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin",
          "NODE_ENV=production",
          "PORT=8080",
          "DATABASE_URL=postgres://webapp:********@webapp-postgres:5432/webapp",
        ],
      },
      NetworkSettings: {
        Ports: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "8080" }] },
      },
      Mounts: [
        { Source: "/Users/demo/webapp/config", Destination: "/app/config", Mode: "ro" },
      ],
    },
  ],
  colima_model_setup: async () => new Promise((r) => setTimeout(r, 1000)),
  colima_model_run: async () => new Promise((r) => setTimeout(r, 1000)),
  colima_model_serve: () => null,
  colima_model_stop_serve: () => null,
  colima_model_pull: async () => new Promise((r) => setTimeout(r, 1500)),
  colima_model_list: () => "MODEL              SIZE     MODIFIED\nai/qwen3:8b        5.2 GB   3 days ago\nai/llama3.2:3b     2.0 GB   1 week ago\n",

  load_settings: () => ({
    hideOnFocusLoss: false,
    notifications: true,
    skipPruneConfirm: false,
    defaultVmPreset: { cpu: 4, memory: 8, disk: 60, vmType: "vz", runtime: "docker", rosetta: true },
  }),
  save_settings: () => null,

  start_colima_poller: () => null,
  start_docker_watcher: () => null,
  stop_docker_watcher: () => null,
};

/* ─── Demo invoke ─── */

if (DEMO_MODE) {
  console.info("[demo] mock data mode active — no colima/docker commands will run");
}

export async function demoInvoke<T>(cmd: string, args?: unknown): Promise<T> {
  const handler = handlers[cmd];
  if (handler) return (await handler((args as Record<string, unknown>) ?? {})) as T;
  console.warn("[demo] unmocked command:", cmd);
  return null as T;
}
