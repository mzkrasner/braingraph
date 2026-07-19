import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import { loadLocalState, validateLocalState } from "../src/local-state.js";
import { sameCanonicalPath } from "../src/util.js";

import {
  createRemoteWithBranch,
  parseJsonObject,
  readWorkspaceManifest,
  runCli,
  runGit,
  temporaryDirectory,
} from "./helpers.js";

test("an existing checkout can be attached without changing its Git layout", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  const checkout = path.join(fixture.root, "seed");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Attached Repository",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  runGit(["init"], workspace);
  const gitDirectoryBefore = runGit(["rev-parse", "--git-dir"], checkout);

  const attached = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "main",
  ]);
  assert.equal(attached.status, 0, attached.stderr);

  const repository = readWorkspaceManifest(workspace).repositories.app;
  assert.deepEqual(repository, {
    mode: "attached",
    url: fixture.remote,
    path: "repositories/app",
    integrationBranch: "main",
    productionBranch: null,
  });
  assert.equal(JSON.stringify(repository).includes(checkout), false);

  const local = loadLocalState(workspace);
  const attachment = local.attachments.app;
  assert.ok(attachment);
  assert.equal(sameCanonicalPath(attachment.checkoutPath, checkout), true);
  if (process.platform !== "win32") {
    assert.equal(
      fs.statSync(path.join(workspace, "braingraph.local.json")).mode & 0o777,
      0o600,
    );
  }
  assert.equal(
    runGit(["check-ignore", "-q", "braingraph.local.json"], workspace),
    "",
  );
  assert.equal(
    fs.readFileSync(path.join(checkout, "CLAUDE.md"), "utf8"),
    "@AGENTS.md\n",
  );
  assert.match(
    fs.readFileSync(path.join(checkout, "AGENTS.md"), "utf8"),
    /Braingraph Local Workspace Bridge/,
  );
  assert.equal(runGit(["status", "--short"], checkout), "");
  assert.equal(
    runGit(["rev-parse", "--git-dir"], checkout),
    gitDirectoryBefore,
  );
  assert.equal(
    fs.existsSync(path.join(workspace, "repositories", "app", ".bare")),
    false,
  );

  const doctor = await runCli(["doctor", workspace]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /repository:app:attached-checkout/);

  const unsupportedWorktree = await runCli([
    "worktree",
    "new",
    "app",
    "feature",
    "--workspace",
    workspace,
  ]);
  assert.equal(unsupportedWorktree.status, 2);
  assert.match(unsupportedWorktree.stderr, /attached checkout/);
});

test("attachment dry runs and removal preserve external repository artifacts", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  const checkout = path.join(fixture.root, "seed");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Attachment Lifecycle",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const command = [
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "main",
  ];
  const planned = await runCli([...command, "--dry-run"]);
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(readWorkspaceManifest(workspace).repositories.app, undefined);
  assert.equal(fs.existsSync(path.join(checkout, "AGENTS.md")), false);

  assert.equal((await runCli(command)).status, 0);
  const hub = path.join(workspace, "repositories", "app");
  const removalPlan = await runCli([
    "repo",
    "remove",
    "app",
    "--workspace",
    workspace,
    "--confirm",
    "app",
    "--dry-run",
  ]);
  assert.equal(removalPlan.status, 0, removalPlan.stderr);
  assert.ok(readWorkspaceManifest(workspace).repositories.app);

  const removed = await runCli([
    "repo",
    "remove",
    "app",
    "--workspace",
    workspace,
    "--confirm",
    "app",
    "--execute",
  ]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(readWorkspaceManifest(workspace).repositories.app, undefined);
  assert.ok(fs.existsSync(hub));
  assert.ok(fs.existsSync(checkout));
  assert.ok(fs.existsSync(path.join(checkout, "AGENTS.md")));
  const local = parseJsonObject(
    fs.readFileSync(path.join(workspace, "braingraph.local.json"), "utf8"),
  );
  assert.deepEqual(local.attachments, {});
});

test("no-bridge attachment respects repository-native instructions", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  const checkout = path.join(fixture.root, "seed");
  const nativeInstructions = "# Repository-native instructions\n";
  fs.writeFileSync(
    path.join(checkout, "AGENTS.md"),
    nativeInstructions,
    "utf8",
  );
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Native Instructions",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );

  const refused = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "main",
  ]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /rerun with --no-bridge/);

  const attached = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "main",
    "--no-bridge",
  ]);
  assert.equal(attached.status, 0, attached.stderr);
  assert.equal(
    fs.readFileSync(path.join(checkout, "AGENTS.md"), "utf8"),
    nativeInstructions,
  );
  assert.equal(fs.existsSync(path.join(checkout, "CLAUDE.md")), false);

  const doctor = await runCli(["doctor", workspace]);
  assert.equal(doctor.status, 0, doctor.stderr);
  assert.match(doctor.stdout, /local-agent-discovery/);
  assert.match(doctor.stdout, /bridge disabled/);
});

test("attachment validates checkout roots, origins, branches, and local state", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  const checkout = path.join(fixture.root, "seed");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Attachment Validation",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const nestedCheckoutPath = path.join(checkout, "nested");
  fs.mkdirSync(nestedCheckoutPath);

  const subdirectory = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    nestedCheckoutPath,
    "--integration-branch",
    "main",
  ]);
  assert.equal(subdirectory.status, 2);

  const wrongOrigin = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--url",
    "https://example.invalid/different.git",
    "--integration-branch",
    "main",
  ]);
  assert.equal(wrongOrigin.status, 2);
  assert.match(wrongOrigin.stderr, /origin does not match/);

  const missingBranch = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "missing",
  ]);
  assert.equal(missingBranch.status, 2);
  assert.match(missingBranch.stderr, /does not contain branch/);

  fs.writeFileSync(
    path.join(workspace, "braingraph.local.json"),
    JSON.stringify({ schemaVersion: 2, attachments: {} }),
    "utf8",
  );
  const invalidLocalState = await runCli([
    "repo",
    "attach",
    "app",
    "--workspace",
    workspace,
    "--checkout",
    checkout,
    "--integration-branch",
    "main",
  ]);
  assert.equal(invalidLocalState.status, 2);
  assert.match(invalidLocalState.stderr, /schemaVersion must be 1/);
});

test("machine-local attachment state rejects malformed mappings", () => {
  assert.deepEqual(validateLocalState(null), ["root must be an object"]);
  assert.deepEqual(validateLocalState({ schemaVersion: 1 }), [
    "attachments must be an object",
  ]);
  const errors = validateLocalState({
    schemaVersion: 2,
    attachments: {
      "Bad Id": null,
      app: {
        checkoutPath: "relative/path",
        bridge: "yes",
        unexpected: true,
      },
    },
  });
  assert.ok(errors.some((error) => error.includes("schemaVersion")));
  assert.ok(errors.some((error) => error.includes("lowercase letters")));
  assert.ok(errors.some((error) => error.includes("must be an object")));
  assert.ok(errors.some((error) => error.includes("unsupported fields")));
  assert.ok(errors.some((error) => error.includes("must be absolute")));
  assert.ok(errors.some((error) => error.includes("must be boolean")));
});
