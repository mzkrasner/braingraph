import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import {
  createRemoteWithBranch,
  parseJsonObject,
  readWorkspaceManifest,
  runCli,
  temporaryDirectory,
  writeNodeExecutable,
} from "./helpers.js";

const HELP_COMMANDS = [
  ["init", "--help"],
  ["doctor", "--help"],
  ["tools", "install", "--help"],
  ["obsidian", "open", "--help"],
  ["qmd", "configure", "--help"],
  ["qmd", "refresh", "--help"],
  ["system", "add", "--help"],
  ["system", "update", "--help"],
  ["repo", "add", "--help"],
  ["repo", "attach", "--help"],
  ["repo", "remove", "--help"],
  ["worktree", "new", "--help"],
  ["worktree", "inspect", "--help"],
  ["worktree", "remove", "--help"],
];

test("routes global, command, and usage help", async () => {
  const globalHelp = await runCli(["--help"]);
  assert.equal(globalHelp.status, 0);
  assert.match(globalHelp.stdout, /agent-first second-brain/);

  for (const command of HELP_COMMANDS) {
    const result = await runCli(command);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:/);
  }

  const unknown = await runCli(["unknown"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown command/);
});

test("doctor reports a healthy generated workspace and machine-readable checks", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Doctor Example"])).status,
    0,
  );
  const bin = createFakeQmd(root, workspace);
  const qmdSkill = path.join(workspace, ".agents", "skills", "qmd", "SKILL.md");
  fs.mkdirSync(path.dirname(qmdSkill), { recursive: true });
  fs.writeFileSync(qmdSkill, "# QMD\n", "utf8");
  const result = await runCli(["doctor", workspace, "--json"], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });

  assert.equal(result.status, 0, result.stderr);
  const summary = parseJsonObject(result.stdout);
  assert.equal(summary.ok, true);
  assert.ok(Array.isArray(summary.checks));
});

test("doctor warns when a registered QMD collection targets different content", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Mismatch Example"])).status,
    0,
  );
  const bin = path.join(root, "bin");
  fs.mkdirSync(path.join(workspace, ".qmd"));
  fs.writeFileSync(path.join(workspace, ".qmd", "index.yml"), "version: 1\n");
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");\nelse console.log("Path: /different\\nPattern: **/*.md");\n',
  );
  const result = await runCli(["doctor", workspace], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[warning\] qmd:collection/);
  assert.match(result.stdout, /missing or mismatched/);
});

test("doctor warns when QMD purpose context is stale", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Purpose Example",
        "--description",
        "Current durable purpose.",
      ])
    ).status,
    0,
  );
  const bin = createFakeQmd(root, workspace, "Outdated purpose.");
  const result = await runCli(["doctor", workspace], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[warning\] qmd:context/);
  assert.match(result.stdout, /missing; run braingraph qmd configure/);
});

test("doctor fails when a required generated artifact is missing", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Broken Example"])).status,
    0,
  );
  fs.rmSync(path.join(workspace, "Knowledge", "Start Here.md"));
  const bin = createFakeQmd(root, workspace);
  const result = await runCli(["doctor", workspace], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /vault:Start Here\.md/);
});

test("tool installation can be reviewed without executing package managers", async () => {
  const root = temporaryDirectory();
  const bin = path.join(root, "bin");
  for (const command of ["npm", "brew"]) {
    writeNodeExecutable(bin, command, "process.exit(0);\n");
  }

  const result = await runCli(["tools", "install", "--dry-run"], {
    env: { PATH: `${bin}${path.delimiter}/usr/bin:/bin` },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /install QMD/);
  assert.match(result.stdout, /\[dry-run\]/);
});

test("Obsidian open enforces execution intent while allowing portable dry runs", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Obsidian Example"])).status,
    0,
  );

  const missingIntent = await runCli(["obsidian", "open", workspace]);
  assert.equal(missingIntent.status, 2);
  assert.match(missingIntent.stderr, /requires exactly one/);

  const conflictingIntent = await runCli([
    "obsidian",
    "open",
    workspace,
    "--dry-run",
    "--execute",
  ]);
  assert.equal(conflictingIntent.status, 2);
  assert.match(conflictingIntent.stderr, /requires exactly one/);

  const dryRun = await runCli(["obsidian", "open", workspace, "--dry-run"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /obsidian:\/\/open/);
});

test("doctor reports optional QMD absence as a warning", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "No QMD Example"])).status,
    0,
  );

  const result = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[warning\] qmd:cli/);
});

test("doctor inspects configured software repository hubs", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software Doctor",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  assert.equal(
    (
      await runCli([
        "repo",
        "add",
        "app",
        "--workspace",
        workspace,
        "--url",
        fixture.remote,
        "--integration-branch",
        "main",
        "--no-clone",
      ])
    ).status,
    0,
  );
  const bin = createFakeQmd(root, workspace);
  const result = await runCli(["doctor", workspace], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /repository:app:hub/);
  assert.match(result.stdout, /repository:app:anchor/);
});

test("tool and QMD commands report missing execution prerequisites", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Prerequisites"])).status,
    0,
  );

  const missingIntent = await runCli(["tools", "install"]);
  assert.equal(missingIntent.status, 2);
  assert.match(missingIntent.stderr, /requires exactly one/);

  const conflictingIntent = await runCli([
    "tools",
    "install",
    "--dry-run",
    "--execute",
  ]);
  assert.equal(conflictingIntent.status, 2);
  assert.match(conflictingIntent.stderr, /requires exactly one/);

  const plannedQmd = await runCli(["qmd", "refresh", workspace, "--dry-run"], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(plannedQmd.status, 2);
  assert.match(plannedQmd.stderr, /workspace-local QMD index/);

  const missingQmd = await runCli(["qmd", "refresh", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(missingQmd.status, 2);
  assert.match(missingQmd.stderr, /QMD is not installed/);

  const missingNpm = await runCli(["tools", "install", "--dry-run"], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(missingNpm.status, 2);
  assert.match(missingNpm.stderr, /npm is required/);
});

function createFakeQmd(
  root: string,
  workspace: string,
  contextOverride?: string,
): string {
  const bin = path.join(root, "bin");
  const vault = path.join(workspace, "Knowledge");
  const manifest = readWorkspaceManifest(workspace);
  const collection = manifest.knowledge.qmd.collection;
  const description = contextOverride ?? manifest.workspace.description;
  const mask =
    "{projects/**/*.md,domains/**/*.md,wiki/**/*.md,reports/**/*.md}";
  fs.mkdirSync(path.join(workspace, ".qmd"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".qmd", "index.yml"), "version: 1\n");
  writeNodeExecutable(
    bin,
    "qmd",
    `const args = process.argv.slice(2);\nif (args[0] === "--version") console.log("qmd 2.5.3");\nelse if (args[0] === "collection" && args[1] === "show") console.log(${JSON.stringify(`Collection: ${collection}\n  Path: ${vault}\n  Pattern: ${mask}`)});\nelse if (args[0] === "context" && args[1] === "list") console.log(${JSON.stringify(`${collection}\n  / (root)\n    ${description}`)});\nelse if (args[0] === "doctor") console.log("healthy");\nelse if (args[0] === "status") console.log("indexed");\n`,
  );
  return bin;
}
