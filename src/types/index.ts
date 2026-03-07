export interface ColimaInstance {
  profile: string;
  status: string;
  arch: string;
  cpus: string;
  memory: string;
  disk: string;
  runtime: string;
  address: string;
}

export interface StartOptions {
  profile: string;
  cpu: number;
  memory: number;
  disk: number;
  vmType: string;
  runtime: string;
  rosetta: boolean;
}

export interface LogLine {
  profile: string;
  line: string;
  isError: boolean;
}

export interface DockerContext {
  name: string;
  current: boolean;
  endpoint: string;
}

export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  ports: string;
  composeProject: string;
  composeService: string;
}

export interface ContainerLogLine {
  text: string;
  isErr: boolean;
}

export interface ContainerLogLineEvent {
  containerId: string;
  text: string;
  isErr: boolean;
}

export interface ContainerLogsTarget {
  container: DockerContainer;
  context: string; // docker context name, e.g. "colima", "colima-dev"
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_since: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  mountpoint: string;
}

export interface DockerEvent {
  profile: string;
  eventType: string; // "container" | "image" | "volume" | "network"
  action: string;    // "start" | "stop" | "die" | "pull" | "create" | "destroy" …
  actorId: string;
  actorName: string;
}

export interface VmStats {
  cpuUsage: string;
  memoryUsed: string;
  memoryTotal: string;
  diskUsed: string;
  diskTotal: string;
}

export interface ContainerStats {
  id: string;
  name: string;
  cpuPercent: string;
  memoryUsage: string;
  memoryLimit: string;
  netIo: string;
  blockIo: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  releaseNotes: string;
}

