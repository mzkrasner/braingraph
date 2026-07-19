import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { ActionEntry, OutputStream } from "./types.js";
import { assertCanonicalPathInside } from "./util.js";

interface ActionPlanOptions {
  root: string;
  dryRun?: boolean;
  output?: OutputStream;
}

const MANAGED_DESTINATION_LABEL = "managed destination";

/** Records and optionally executes an additive filesystem change set. */
export class ActionPlan {
  public readonly dryRun: boolean;
  public readonly output: OutputStream;
  public readonly actions: ActionEntry[] = [];
  private readonly root: string;

  /** Creates an action plan for real or dry-run execution. */
  public constructor({
    root,
    dryRun = false,
    output = process.stdout,
  }: ActionPlanOptions) {
    this.root = path.resolve(root);
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
    this.assertManagedPath(directory);
    if (fs.existsSync(directory)) {
      if (!fs.statSync(directory).isDirectory()) {
        throw new Error(
          `managed directory path is not a directory: ${directory}`,
        );
      }
      this.note("directory", directory, "skipped");
      return;
    }
    this.note("create directory", directory);
    if (!this.dryRun) {
      fs.mkdirSync(directory, { recursive: true });
      this.assertManagedPath(directory);
    }
  }

  /** Writes a new file while preserving any existing file. */
  public writeMissing(file: string, content: string): boolean {
    this.assertManagedPath(file);
    if (fs.existsSync(file)) {
      this.note("preserve file", file, "skipped");
      return false;
    }
    this.note("create file", file);
    if (!this.dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      this.assertManagedPath(file);
      fs.writeFileSync(file, content, { encoding: "utf8", flag: "wx" });
    }
    return true;
  }

  /** Adds a generated block to a text file without disturbing other content. */
  public ensureTextBlock(file: string, marker: string, body: string): void {
    this.assertManagedPath(file);
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (current.includes(marker)) {
      this.note("preserve file", file, "skipped");
      return;
    }
    this.note(current.length === 0 ? "create file" : "update file", file);
    if (this.dryRun) return;
    const separator =
      current.length === 0 || current.endsWith("\n") ? "" : "\n";
    const content = `${current}${separator}${current.length === 0 ? "" : "\n"}${body.trimEnd()}\n`;
    writeTextAtomic(file, content, this.root);
  }

  /** Atomically writes a JSON value through the current plan. */
  public writeJson(
    file: string,
    value: unknown,
    label = "update file",
    newFileMode = 0o666,
  ): void {
    this.assertManagedPath(file);
    this.note(label, file);
    if (!this.dryRun) writeJsonAtomic(file, value, this.root, newFileMode);
  }

  private assertManagedPath(candidate: string): void {
    assertCanonicalPathInside(this.root, candidate, MANAGED_DESTINATION_LABEL);
  }
}

/** Reads JSON as an untrusted value for subsequent validation. */
export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

/** Atomically serializes a JSON-compatible value to disk. */
export function writeJsonAtomic(
  file: string,
  value: unknown,
  root = path.dirname(file),
  newFileMode = 0o666,
): void {
  writeTextAtomic(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    root,
    newFileMode,
  );
}

/** Atomically writes text while preserving an existing file's permission mode. */
export function writeTextAtomic(
  file: string,
  content: string,
  root = path.dirname(file),
  newFileMode = 0o666,
): void {
  assertCanonicalPathInside(root, file, MANAGED_DESTINATION_LABEL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  assertCanonicalPathInside(root, file, MANAGED_DESTINATION_LABEL);
  const existingMode = existingRegularFileMode(file);
  const temporary = `${file}.tmp-${String(process.pid)}-${randomBytes(6).toString("hex")}`;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, "wx", existingMode ?? newFileMode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (existingMode !== undefined) fs.chmodSync(temporary, existingMode);
    fs.renameSync(temporary, file);
  } catch (error: unknown) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporary);
    } catch (cleanupError: unknown) {
      if (!isMissingPathError(cleanupError)) throw cleanupError;
    }
    throw error;
  }
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

function existingRegularFileMode(file: string): number | undefined {
  try {
    const stats = fs.lstatSync(file);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `refusing to atomically replace a symbolic link: ${file}`,
      );
    }
    if (!stats.isFile()) {
      throw new Error(`managed file path is not a regular file: ${file}`);
    }
    return stats.mode & 0o777;
  } catch (error: unknown) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
