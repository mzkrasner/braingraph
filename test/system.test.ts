import assert from "node:assert/strict";
import path from "node:path";

import { test } from "vitest";

import {
  readWorkspaceManifest,
  runCli,
  temporaryDirectory,
} from "./helpers.js";

test("external system help documents the complete role vocabulary", async () => {
  const result = await runCli(["system", "add", "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /source \| intake \| execution \| communication \| reference \| archive/,
  );
});

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
    "--identifier",
    "native case ID,stable record URL",
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
    "--fallback",
    "Stop and report the unavailable connector or conflict.",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readWorkspaceManifest(workspace);
  const system = manifest.externalSystems[0];
  assert.ok(system);
  assert.deepEqual(system.roles, ["execution", "source"]);
  assert.deepEqual(system.owns, ["case status", "assignment"]);
  assert.deepEqual(system.identifiers, ["native case ID", "stable record URL"]);
  assert.equal(system.status, "active");
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
    "--identifier",
    "document ID",
    "--fallback",
    "Request an approved export.",
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
    "--identifier",
    "document ID",
    "--fallback",
    "Request an approved export.",
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
    "--identifier",
    "archive record ID",
    "--fallback",
    "Stop and report that the archive is unavailable.",
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
    "--identifier",
    "document ID",
    "--fallback",
    "Stop.",
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
    "--identifier",
    "document ID",
    "--fallback",
    "Stop.",
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

test("updates and retires an external-system contract without losing provenance", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const add = [
    "system",
    "add",
    "tracker",
    "--workspace",
    workspace,
    "--name",
    "Tracker",
    "--role",
    "execution",
    "--owns",
    "live issue status",
    "--identifier",
    "native issue ID",
    "--fallback",
    "Use a dated export and label it stale.",
    "--notes",
    "Initial notes",
  ];
  assert.equal((await runCli(add)).status, 0);

  const planned = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--status",
    "planned",
    "--dry-run",
  ]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(
    readWorkspaceManifest(workspace).externalSystems[0]?.status,
    "active",
  );

  const update = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--status",
    "inactive",
    "--read",
    "none",
    "--notes=",
  ]);
  assert.equal(update.status, 0, update.stderr);
  const system = readWorkspaceManifest(workspace).externalSystems[0];
  assert.ok(system);
  assert.equal(system.status, "inactive");
  assert.equal(system.access.read, "none");
  assert.equal(system.notes, undefined);
  assert.deepEqual(system.identifiers, ["native issue ID"]);

  const unchanged = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--status",
    "inactive",
  ]);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.match(unchanged.stdout, /unchanged/);
});

test("external-system updates enforce explicit delegated write scope", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Example"])).status,
    0,
  );
  const command = [
    "system",
    "add",
    "tracker",
    "--workspace",
    workspace,
    "--name",
    "Tracker",
    "--role",
    "execution",
    "--owns",
    "issue status",
    "--identifier",
    "issue ID",
    "--fallback",
    "Stop and report.",
  ];
  assert.equal((await runCli(command)).status, 0);

  const missingScope = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--write",
    "delegated",
  ]);
  assert.equal(missingScope.status, 2);
  assert.match(missingScope.stderr, /write-scope is required/);

  const delegated = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--write",
    "delegated",
    "--write-scope",
    "Add labels to records explicitly selected by the human.",
  ]);
  assert.equal(delegated.status, 0, delegated.stderr);
  assert.equal(
    readWorkspaceManifest(workspace).externalSystems[0]?.writeScope,
    "Add labels to records explicitly selected by the human.",
  );

  const approvalGated = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--write",
    "human-approval",
  ]);
  assert.equal(approvalGated.status, 0, approvalGated.stderr);
  assert.equal(
    readWorkspaceManifest(workspace).externalSystems[0]?.writeScope,
    undefined,
  );

  const invalidScope = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
    "--write-scope",
    "This must not remain without delegated write access.",
  ]);
  assert.equal(invalidScope.status, 2);
  assert.match(invalidScope.stderr, /only valid when --write=delegated/);

  const noFields = await runCli([
    "system",
    "update",
    "tracker",
    "--workspace",
    workspace,
  ]);
  assert.equal(noFields.status, 2);
  assert.match(noFields.stderr, /at least one field/);

  const unknown = await runCli([
    "system",
    "update",
    "missing",
    "--workspace",
    workspace,
    "--status",
    "inactive",
  ]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown external system/);
});
