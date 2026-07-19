export type WorkspaceProfile = "knowledge" | "software";

export type ExternalSystemRole =
  "source" | "intake" | "execution" | "communication" | "reference" | "archive";

export type ExternalReadAccess = "none" | "manual" | "connector";
export type ExternalWriteAccess = "prohibited" | "human-approval" | "delegated";
export type ExternalFreshness =
  "verify-live" | "revision-tracked" | "snapshot" | "not-applicable";
export type ExternalCapture =
  "link" | "summarize" | "synchronize" | "copy" | "exclude";
export type Sensitivity = "public" | "private" | "confidential" | "regulated";

export interface ExternalSystem {
  id: string;
  name: string;
  url?: string;
  roles: ExternalSystemRole[];
  owns: string[];
  access: {
    read: ExternalReadAccess;
    write: ExternalWriteAccess;
  };
  freshness: ExternalFreshness;
  capture: ExternalCapture;
  sensitivity: Sensitivity;
  notes?: string;
}

export interface RepositoryConfig {
  url: string;
  path: string;
  integrationBranch: string;
  productionBranch: string | null;
  stableWorktree: string;
  branchPrefix: string;
}

export interface WorkspaceManifest {
  $schema: string;
  schemaVersion: 1;
  workspace: {
    name: string;
    slug: string;
    profiles: WorkspaceProfile[];
  };
  knowledge: {
    directory: string;
    obsidian: {
      enabled: true;
      vaultName: string;
    };
    qmd: {
      enabled: true;
      collection: string;
      include: string[];
    };
  };
  externalSystems: ExternalSystem[];
  repositories: Record<string, RepositoryConfig>;
}

export interface LoadedWorkspace {
  root: string;
  file: string;
  manifest: WorkspaceManifest;
}

export interface OutputStream {
  write(value: string): unknown;
}

export interface CommandContext {
  output?: OutputStream;
  errorOutput?: OutputStream;
}

export type OptionScalar = string | boolean;
export type OptionValue = OptionScalar | OptionScalar[];
export type OptionMap = Map<string, OptionValue>;

export interface ParsedArguments {
  positionals: string[];
  options: OptionMap;
}

export interface ProcessResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: "pipe" | "inherit" | "ignore";
  allowFailure?: boolean;
}

export interface ActionEntry {
  action: string;
  target: string;
  status: "planned" | "skipped";
}

export interface RegisteredWorktree {
  path: string;
  head?: string;
  branch?: string;
  detached?: boolean;
}

export interface WorktreeInspection {
  identifier: string;
  path: string;
  branch: string | null;
  expectedIntegrationBranch: string;
  stableWorktree: string;
  registered: boolean;
  clean: boolean;
  status: string;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  commitsNotInIntegrationBranch: number | null;
  currentProcessInside: boolean;
}

export interface WorktreeProcess {
  pid: string | null;
  cwd: string;
}

export interface WorktreeInspectionWithProcesses extends WorktreeInspection {
  processes: WorktreeProcess[];
}
