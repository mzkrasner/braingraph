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
} from "./helpers.js";

test("software profile creates, inspects, and safely removes an isolated worktree", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("dev");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software Example",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );

  const add = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "dev",
  ]);
  assert.equal(add.status, 0, add.stderr);
  assert.ok(
    fs.existsSync(path.join(workspace, "repositories", "app", ".bare")),
  );
  assert.ok(fs.existsSync(path.join(workspace, "repositories", "app", "dev")));

  const planned = await runCli([
    "worktree",
    "new",
    "app",
    "planned-feature",
    "--workspace",
    workspace,
    "--no-fetch",
    "--dry-run",
  ]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /\[dry-run\]/);
  assert.equal(
    fs.existsSync(
      path.join(workspace, "repositories", "app", "planned-feature"),
    ),
    false,
  );

  const create = await runCli([
    "worktree",
    "new",
    "app",
    "feature-one",
    "--workspace",
    workspace,
  ]);
  assert.equal(create.status, 0, create.stderr);
  const feature = path.join(workspace, "repositories", "app", "feature-one");
  assert.ok(fs.existsSync(feature));

  const inspect = await runCli([
    "worktree",
    "inspect",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--json",
  ]);
  assert.equal(inspect.status, 0, inspect.stderr);
  const inspection = parseJsonObject(inspect.stdout);
  assert.equal(inspection.registered, true);
  assert.equal(inspection.clean, true);
  assert.equal(inspection.branch, "work/feature-one");

  const textInspection = await runCli([
    "worktree",
    "inspect",
    "app",
    "feature-one",
    "--workspace",
    workspace,
  ]);
  assert.equal(textInspection.status, 0, textInspection.stderr);
  assert.match(textInspection.stdout, /Worktree inspection/);

  fs.writeFileSync(
    path.join(feature, "untracked.txt"),
    "preserve me\n",
    "utf8",
  );
  const refused = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/feature-one",
    "--reason",
    "no-longer-needed",
  ]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /dirty/);
  fs.rmSync(path.join(feature, "untracked.txt"));

  const inspectOnly = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
  ]);
  assert.equal(inspectOnly.status, 0, inspectOnly.stderr);
  assert.ok(fs.existsSync(feature));
  assert.match(inspectOnly.stdout, /Inspection only/);

  const removalPlan = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--dry-run",
    "--confirm",
    "app/feature-one",
    "--reason",
    "review-complete",
  ]);
  assert.equal(removalPlan.status, 0, removalPlan.stderr);
  assert.match(removalPlan.stdout, /would preserve/);
  assert.ok(fs.existsSync(feature));

  const wrongConfirmation = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/wrong",
    "--reason",
    "merged-pr",
  ]);
  assert.equal(wrongConfirmation.status, 2);
  assert.match(wrongConfirmation.stderr, /exactly match/);

  const wrongReason = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/feature-one",
    "--reason",
    "unknown",
  ]);
  assert.equal(wrongReason.status, 2);
  assert.match(wrongReason.stderr, /reason must be one of/);

  const remove = await runCli([
    "worktree",
    "remove",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/feature-one",
    "--reason",
    "no-longer-needed",
  ]);
  assert.equal(remove.status, 0, remove.stderr);
  assert.equal(fs.existsSync(feature), false);

  const recreate = await runCli([
    "worktree",
    "new",
    "app",
    "feature-one",
    "--workspace",
    workspace,
    "--no-fetch",
  ]);
  assert.equal(recreate.status, 0, recreate.stderr);
  assert.ok(fs.existsSync(feature));

  const duplicatePath = await runCli([
    "worktree",
    "new",
    "app",
    "feature-one",
    "--workspace",
    workspace,
  ]);
  assert.equal(duplicatePath.status, 2);
  assert.match(duplicatePath.stderr, /path already exists/);
});

test("repository registration requires the software profile and supports dry-run planning", async () => {
  const knowledgeWorkspace = path.join(temporaryDirectory(), "knowledge");
  assert.equal(
    (await runCli(["init", knowledgeWorkspace, "--name", "Knowledge"])).status,
    0,
  );
  const unsupported = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    knowledgeWorkspace,
    "--url",
    "https://example.invalid/app.git",
    "--integration-branch",
    "main",
  ]);
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /software profile is not enabled/);

  const softwareWorkspace = path.join(temporaryDirectory(), "software");
  assert.equal(
    (
      await runCli([
        "init",
        softwareWorkspace,
        "--name",
        "Software",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const planned = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    softwareWorkspace,
    "--url",
    "https://example.invalid/app.git",
    "--integration-branch",
    "main",
    "--dry-run",
  ]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.match(planned.stdout, /git init --bare/);
  assert.equal(
    readWorkspaceManifest(softwareWorkspace).repositories.app,
    undefined,
  );
});

test("worktree creation protects stable names and requires a cloned anchor", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software",
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
        "https://example.invalid/app.git",
        "--integration-branch",
        "main",
        "--no-clone",
      ])
    ).status,
    0,
  );

  const reserved = await runCli([
    "worktree",
    "new",
    "app",
    "main",
    "--workspace",
    workspace,
  ]);
  assert.equal(reserved.status, 2);
  assert.match(reserved.stderr, /reserved/);

  const missingAnchor = await runCli([
    "worktree",
    "new",
    "app",
    "feature",
    "--workspace",
    workspace,
  ]);
  assert.equal(missingAnchor.status, 2);
  assert.match(missingAnchor.stderr, /missing Git anchor/);
});

test("worktree removal protects the stable integration worktree", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software Example",
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
      ])
    ).status,
    0,
  );
  const result = await runCli([
    "worktree",
    "remove",
    "app",
    "main",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/main",
    "--reason",
    "no-longer-needed",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /protected/);
});

test("a repository registered without cloning can be cloned later", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software Example",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const register = await runCli([
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
  ]);
  assert.equal(register.status, 0, register.stderr);
  const anchor = path.join(workspace, "repositories", "app", ".bare");
  assert.equal(fs.existsSync(anchor), false);

  const clone = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main",
  ]);
  assert.equal(clone.status, 0, clone.stderr);
  assert.ok(fs.existsSync(anchor));
  assert.ok(fs.existsSync(path.join(workspace, "repositories", "app", "main")));

  const unchanged = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main",
  ]);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  assert.match(unchanged.stdout, /Repository unchanged/);

  const conflict = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    "https://example.invalid/different.git",
    "--integration-branch",
    "main",
  ]);
  assert.equal(conflict.status, 2);
  assert.match(conflict.stderr, /different configuration/);

  const missingUrl = await runCli([
    "repo",
    "add",
    "missing",
    "--workspace",
    workspace,
    "--integration-branch",
    "main",
  ]);
  assert.equal(missingUrl.status, 2);
  assert.match(missingUrl.stderr, /url is required/);
});
