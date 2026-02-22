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
}

export interface ContainerLogLine {
  text: string;
  isErr: boolean;
}

export interface ContainerLogsTarget {
  container: DockerContainer;
  context: string; // docker context name, e.g. "colima", "colima-dev"
}

