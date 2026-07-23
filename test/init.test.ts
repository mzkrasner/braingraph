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
    "--description",
    "Durable knowledge for a fictional example.",
    "--scope",
    "project",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  assert.equal(manifest.knowledge.obsidian.enabled, true);
  assert.equal(manifest.templateVersion, 1);
  assert.equal(manifest.workspace.scope, "project");
  assert.equal(manifest.workspace.sensitivity, "private");
  assert.deepEqual(manifest.knowledge.maintenance, {
    mode: "proposal-first",
  });
  assert.equal(
    manifest.workspace.description,
    "Durable knowledge for a fictional example.",
  );
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
  assert.ok(
    fs.existsSync(path.join(workspace, "Knowledge", "raw", "README.md")),
  );
  assert.ok(
    fs.existsSync(path.join(workspace, "Knowledge", "_templates", "Source.md")),
  );
  const rootInstructions = fs.readFileSync(
    path.join(workspace, "AGENTS.md"),
    "utf8",
  );
  assert.match(rootInstructions, /QMD Retrieval/);
  assert.match(rootInstructions, /## Workspace Discovery/);
  assert.match(
    rootInstructions,
    /A local bridge for one attached checkout does not configure sibling Git worktrees/,
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
        "--identifier",
        "native document ID",
        "--fallback",
        "Stop and request an approved export.",
      ])
    ).status,
    0,
  );

  const result = await runCli([
    "init",
    workspace,
    "--profile",
    "software",
    "--description",
    "Updated durable purpose.",
    "--scope",
    "organization",
    "--sensitivity",
    "confidential",
    "--maintenance-mode",
    "delegated",
    "--maintenance-scope",
    "Keep durable project and domain synthesis current after completed work.",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  assert.equal(manifest.externalSystems.length, 1);
  assert.deepEqual(manifest.workspace.profiles, ["knowledge", "software"]);
  assert.equal(manifest.workspace.description, "Updated durable purpose.");
  assert.equal(manifest.workspace.scope, "organization");
  assert.equal(manifest.workspace.sensitivity, "confidential");
  assert.deepEqual(manifest.knowledge.maintenance, {
    mode: "delegated",
    delegatedScope:
      "Keep durable project and domain synthesis current after completed work.",
  });
  assert.ok(fs.existsSync(path.join(workspace, "repositories", "README.md")));

  const proposalFirst = await runCli([
    "init",
    workspace,
    "--maintenance-mode",
    "proposal-first",
  ]);
  assert.equal(proposalFirst.status, 0, proposalFirst.stderr);
  assert.deepEqual(readWorkspaceManifest(workspace).knowledge.maintenance, {
    mode: "proposal-first",
  });
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

  const invalidScope = await runCli([
    "init",
    path.join(parent, "invalid-scope"),
    "--name",
    "Invalid Scope",
    "--scope",
    "everything",
  ]);
  assert.equal(invalidScope.status, 2);
  assert.match(invalidScope.stderr, /scope must be one of/);

  const invalidSensitivity = await runCli([
    "init",
    path.join(parent, "invalid-sensitivity"),
    "--name",
    "Invalid Sensitivity",
    "--sensitivity",
    "secretish",
  ]);
  assert.equal(invalidSensitivity.status, 2);
  assert.match(invalidSensitivity.stderr, /sensitivity must be one of/);

  const missingMaintenanceScope = await runCli([
    "init",
    path.join(parent, "missing-maintenance-scope"),
    "--name",
    "Missing Maintenance Scope",
    "--maintenance-mode",
    "delegated",
  ]);
  assert.equal(missingMaintenanceScope.status, 2);
  assert.match(missingMaintenanceScope.stderr, /maintenance-scope is required/);

  const multilineDescription = await runCli([
    "init",
    path.join(parent, "multiline-description"),
    "--name",
    "Multiline Description",
    "--description",
    "First line\nSecond line",
  ]);
  assert.equal(multilineDescription.status, 2);
  assert.match(multilineDescription.stderr, /description must be one line/);

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
