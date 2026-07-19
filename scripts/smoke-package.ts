import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../src/process.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "braingraph-package-"));

try {
  const pack = execute(
    "npm",
    ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary],
    repositoryRoot,
  );
  const packed = parsePackOutput(pack);
  const archive = path.join(temporary, packed.filename);
  assert.ok(fs.existsSync(archive), `missing package archive: ${archive}`);

  const consumer = path.join(temporary, "consumer");
  fs.mkdirSync(consumer);
  execute("npm", ["init", "--yes"], consumer);
  execute(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive],
    consumer,
  );

  const cli = path.join(
    consumer,
    "node_modules",
    "braingraph",
    "dist",
    "bin.js",
  );
  const workspace = path.join(temporary, "workspace");
  execute(
    process.execPath,
    [
      cli,
      "init",
      workspace,
      "--name",
      "Packaged Smoke",
      "--description",
      "Synthetic packaged CLI verification.",
      "--scope",
      "project",
    ],
    consumer,
  );
  execute(process.execPath, [cli, "doctor", workspace, "--json"], consumer);
  assert.ok(fs.existsSync(path.join(workspace, "braingraph.json")));
  assert.ok(fs.existsSync(path.join(workspace, "Knowledge", "Start Here.md")));
  process.stdout.write("Packed CLI smoke test passed.\n");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function execute(
  command: string,
  args: readonly string[],
  cwd: string,
): string {
  return run(command, args, { cwd }).stdout;
}

function parsePackOutput(value: string): { filename: string } {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== 1) {
    throw new TypeError("unexpected npm pack output");
  }
  const [entry] = parsed as unknown[];
  if (
    typeof entry !== "object" ||
    entry === null ||
    !("filename" in entry) ||
    typeof entry.filename !== "string"
  ) {
    throw new TypeError("npm pack output does not contain a filename");
  }
  return { filename: entry.filename };
}
