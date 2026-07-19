import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import {
  readWorkspaceManifest,
  runCli,
  temporaryDirectory,
} from "./helpers.js";

test("init creates an Obsidian and QMD-ready knowledge workspace", async () => {
  const parent = temporaryDirectory();
  const workspace = path.join(parent, "example");
  const result = await runCli([
    "init",
    workspace,
    "--name",
    "Example Workspace",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  assert.equal(manifest.knowledge.obsidian.enabled, true);
  assert.equal(manifest.knowledge.qmd.enabled, true);
  assert.equal(manifest.knowledge.qmd.collection, "example-workspace-brain");
  assert.ok(
    fs.existsSync(path.join(workspace, "Knowledge", ".obsidian", "app.json")),
  );
  assert.ok(
    fs.existsSync(
      path.join(workspace, "Knowledge", ".obsidian", "templates.json"),
    ),
  );
  assert.ok(fs.existsSync(path.join(workspace, "Knowledge", ".gitignore")));
  assert.ok(fs.existsSync(path.join(workspace, "Knowledge", "projects")));
  assert.match(
    fs.readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
    /QMD Retrieval/,
  );
});

test("init dry run does not create a workspace", async () => {
  const parent = temporaryDirectory();
  const workspace = path.join(parent, "planned");
  const result = await runCli([
    "init",
    workspace,
    "--name",
    "Planned",
    "--dry-run",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(workspace), false);
  assert.match(result.stdout, /\[dry-run\]/);
});

test("init is idempotent and preserves user-authored files", async () => {
  const parent = temporaryDirectory();
  const workspace = path.join(parent, "example");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const index = path.join(workspace, "Knowledge", "index.md");
  fs.writeFileSync(index, "# My curated index\n", "utf8");

  const second = await runCli(["init", workspace, "--name", "Example"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(index, "utf8"), "# My curated index\n");
  assert.match(second.stdout, /preserve file/);
});

test("init refuses a conflicting existing manifest", async () => {
  const parent = temporaryDirectory();
  const workspace = path.join(parent, "example");
  assert.equal(
    (await runCli(["init", workspace, "--name", "First"])).status,
    0,
  );
  const result = await runCli(["init", workspace, "--name", "Second"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /conflicts/);
});

test("init preserves evolved manifest state and can add the software profile", async () => {
  const parent = temporaryDirectory();
  const workspace = path.join(parent, "example");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  assert.equal(
    (
      await runCli([
        "system",
        "add",
        "documents",
        "--workspace",
        workspace,
        "--name",
        "Documents",
        "--role",
        "source",
        "--owns",
        "reference files",
      ])
    ).status,
    0,
  );

  const result = await runCli(["init", workspace, "--profile", "software"]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  assert.equal(manifest.externalSystems.length, 1);
  assert.deepEqual(manifest.workspace.profiles, ["knowledge", "software"]);
  assert.ok(fs.existsSync(path.join(workspace, "repositories", "README.md")));
});

test("init validates profiles and plans optional setup without external writes", async () => {
  const parent = temporaryDirectory();
  const invalid = await runCli([
    "init",
    path.join(parent, "invalid"),
    "--name",
    "Invalid",
    "--profile",
    "unsupported",
  ]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /unsupported profile/);

  const workspace = path.join(parent, "planned");
  const planned = await runCli([
    "init",
    workspace,
    "--name",
    "Planned Setup",
    "--install-tools",
    "--configure",
    "--dry-run",
  ]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /install tools/);
  assert.match(planned.stdout, /configure QMD/);
  assert.equal(fs.existsSync(workspace), false);
});
