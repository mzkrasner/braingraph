import assert from "node:assert/strict";
import path from "node:path";

import { test } from "vitest";

import {
  readWorkspaceManifest,
  runCli,
  temporaryDirectory,
} from "./helpers.js";

test("registers a tool-neutral external system contract", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const result = await runCli([
    "system",
    "add",
    "case-tracker",
    "--workspace",
    workspace,
    "--name",
    "Case Tracker",
    "--role",
    "execution,source",
    "--owns",
    "case status,assignment",
    "--read",
    "connector",
    "--write",
    "human-approval",
    "--freshness",
    "verify-live",
    "--capture",
    "summarize",
    "--sensitivity",
    "confidential",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  const system = manifest.externalSystems[0];
  assert.ok(system);
  assert.deepEqual(system.roles, ["execution", "source"]);
  assert.deepEqual(system.owns, ["case status", "assignment"]);
  assert.equal(system.access.write, "human-approval");
});

test("external system dry run leaves the manifest unchanged", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const result = await runCli([
    "system",
    "add",
    "files",
    "--workspace",
    workspace,
    "--name",
    "Files",
    "--role",
    "source",
    "--owns",
    "documents",
    "--dry-run",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  assert.equal(manifest.externalSystems.length, 0);
});

test("external system registration validates options and remains idempotent", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const command = [
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
    "documents",
  ];
  assert.equal((await runCli(command)).status, 0);

  const unchanged = await runCli(command);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.match(unchanged.stdout, /unchanged/);

  const second = await runCli([
    "system",
    "add",
    "archive",
    "--workspace",
    workspace,
    "--name",
    "Archive",
    "--role",
    "archive",
    "--owns",
    "historical records",
  ]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(
    readWorkspaceManifest(workspace).externalSystems.map((system) => system.id),
    ["archive", "documents"],
  );

  const conflict = await runCli([...command, "--notes", "different"]);
  assert.equal(conflict.status, 2);
  assert.match(conflict.stderr, /different configuration/);

  const invalid = await runCli([
    "system",
    "add",
    "invalid",
    "--workspace",
    workspace,
    "--name",
    "Invalid",
    "--role",
    "unsupported",
    "--owns",
    "documents",
  ]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /unsupported values/);

  const invalidAccess = await runCli([
    "system",
    "add",
    "invalid-access",
    "--workspace",
    workspace,
    "--name",
    "Invalid Access",
    "--role",
    "source",
    "--owns",
    "documents",
    "--read",
    "unsupported",
  ]);
  assert.equal(invalidAccess.status, 2);
  assert.match(invalidAccess.stderr, /read must be one of/);

  const missingName = await runCli([
    "system",
    "add",
    "missing-name",
    "--workspace",
    workspace,
    "--role",
    "source",
    "--owns",
    "documents",
  ]);
  assert.equal(missingName.status, 2);
  assert.match(missingName.stderr, /name is required/);
});
