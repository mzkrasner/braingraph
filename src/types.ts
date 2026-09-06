export type WorkspaceProfile = "knowledge" | "software";
export type WorkspaceScope =
  | "project"
  | "organization"
  | "professional-domain"
  | "personal-domain"
  | "mixed";
export type MaintenanceMode = "proposal-first" | "delegated";

export type ExternalSystemRole =
  "source" | "intake" | "execution" | "communication" | "reference" | "archive";

export type ExternalSystemStatus = "active" | "planned" | "inactive";
export type ExternalReadAccess = "none" | "manual" | "connector";
export type ExternalWriteAccess = "prohibited" | "human-approval" | "delegated";
export type ExternalFreshness =
  "verify-live" | "revision-tracked" | "snapshot" | "not-applicable";
export type ExternalCapture =
  "link" | "summarize" | "synchronize" | "copy" | "exclude";
export type Sensitivity = "public" | "private" | "confidential" | "regulated";

/** Non-secret, provider-reported identity constraints, never credentials. */
export interface ExternalSystemIdentity {
  account?: string;
  tenant?: string;
  principal?: string;
}

export interface ExternalSystem {
  id: string;
  name: string;
  status: ExternalSystemStatus;
  url?: string;
  roles: ExternalSystemRole[];
  owns: string[];
  identifiers: string[];
  identity?: ExternalSystemIdentity;
  access: {
    read: ExternalReadAccess;
    write: ExternalWriteAccess;
  };
  writeScope?: string;
  freshness: ExternalFreshness;
  capture: ExternalCapture;
  sensitivity: Sensitivity;
  fallback: string;
  notes?: string;
}

interface RepositoryConfigBase {
  mode: "managed" | "attached";
  url: string;
  path: string;
  integrationBranch: string;
  productionBranch: string | null;
}

export interface ManagedRepositoryConfig extends RepositoryConfigBase {
  mode: "managed";
  stableWorktree: string;
  branchPrefix: string;
}

export interface AttachedRepositoryConfig extends RepositoryConfigBase {
  mode: "attached";
}

export type RepositoryConfig =
  ManagedRepositoryConfig | AttachedRepositoryConfig;

export interface LocalWorkspaceState {
  schemaVersion: 1;
  systemBindings?: Record<string, LocalSystemBinding>;
  attachments: Record<
    string,
    {
      checkoutPath: string;
      bridge: boolean;
    }
  >;
}

/** A workspace-local mapping, not proof of current authentication. */
export interface LocalSystemBinding {
  connector: string;
  identity: ExternalSystemIdentity;
  recordedAt: string;
}

export interface WorkspaceManifest {
  $schema: string;
  schemaVersion: 1;
  templateVersion: number;
  workspace: {
    name: string;
    slug: string;
    description: string;
    scope: WorkspaceScope;
    sensitivity: Sensitivity;
    profiles: WorkspaceProfile[];
  };
  knowledge: {
    directory: string;
    maintenance: {
      mode: MaintenanceMode;
      delegatedScope?: string;
    };
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

export interface WorktreeProcessInspection {
  status: "clear" | "in-use" | "unknown";
  processes: WorktreeProcess[];
  reason?: string;
}

export interface WorktreeInspectionWithProcesses extends WorktreeInspection {
  processInspection: WorktreeProcessInspection;
}
