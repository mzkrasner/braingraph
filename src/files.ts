import fs from "node:fs";
import path from "node:path";

import type { ActionEntry, OutputStream } from "./types.js";

interface ActionPlanOptions {
  dryRun?: boolean;
  output?: OutputStream;
}

/** Records and optionally executes an additive filesystem change set. */
export class ActionPlan {
  public readonly dryRun: boolean;
  public readonly output: OutputStream;
  public readonly actions: ActionEntry[] = [];

  /** Creates an action plan for real or dry-run execution. */
  public constructor({
    dryRun = false,
    output = process.stdout,
  }: ActionPlanOptions = {}) {
    this.dryRun = dryRun;
    this.output = output;
  }

  /** Records a human-readable action. */
  public note(
    action: string,
    target: string,
    status: ActionEntry["status"] = "planned",
  ): void {
    const entry = { action, target, status };
    this.actions.push(entry);
    this.output.write(
      `${this.dryRun ? "[dry-run] " : ""}${action}: ${target}${status === "skipped" ? " (unchanged)" : ""}\n`,
    );
  }

  /** Creates a directory when it does not already exist. */
  public ensureDirectory(directory: string): void {
    if (fs.existsSync(directory)) {
      this.note("directory", directory, "skipped");
      return;
    }
    this.note("create directory", directory);
    if (!this.dryRun) fs.mkdirSync(directory, { recursive: true });
  }

  /** Writes a new file while preserving any existing file. */
  public writeMissing(file: string, content: string): boolean {
    if (fs.existsSync(file)) {
      this.note("preserve file", file, "skipped");
      return false;
    }
    this.note("create file", file);
    if (!this.dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, "utf8");
    }
    return true;
  }

  /** Atomically writes a JSON value through the current plan. */
  public writeJson(file: string, value: unknown, label = "update file"): void {
    this.note(label, file);
    if (!this.dryRun) writeJsonAtomic(file, value);
  }
}

/** Reads JSON as an untrusted value for subsequent validation. */
export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

/** Atomically serializes a JSON-compatible value to disk. */
export function writeJsonAtomic(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${String(process.pid)}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

/** Recursively lists regular files below a directory. */
export function listFiles(root: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(root)) return files;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}
