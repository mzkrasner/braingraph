import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import {
  createRemoteWithBranch,
  parseJsonObject,
  readWorkspaceManifest,
  runCli,
  runGit,
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
  if (process.platform === "win32") {
    assert.equal(remove.status, 2);
    assert.match(remove.stderr, /could not verify/);
  } else {
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
  }
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
  const fixture = createRemoteWithBranch("main");
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
    fixture.remote,
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
  const fixture = createRemoteWithBranch("main");
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
        fixture.remote,
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

test.skipIf(process.platform === "win32")(
  "worktree removal refuses to proceed when process inspection is inconclusive",
  async () => {
    const root = temporaryDirectory();
    const workspace = path.join(root, "workspace");
    const fixture = createRemoteWithBranch("main");
    assert.equal(
      (
        await runCli([
          "init",
          workspace,
          "--name",
          "Process Safety",
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
    assert.equal(
      (
        await runCli([
          "worktree",
          "new",
          "app",
          "feature",
          "--workspace",
          workspace,
        ])
      ).status,
      0,
    );
    const feature = path.join(workspace, "repositories", "app", "feature");
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "lsof"),
      "#!/bin/sh\nprintf 'inspection unavailable\\n' >&2\nexit 2\n",
      { encoding: "utf8", mode: 0o755 },
    );

    const result = await runCli(
      [
        "worktree",
        "remove",
        "app",
        "feature",
        "--workspace",
        workspace,
        "--execute",
        "--confirm",
        "app/feature",
        "--reason",
        "no-longer-needed",
      ],
      { env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` } },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /could not verify/);
    assert.ok(fs.existsSync(feature));
  },
);

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
  assert.match(unchanged.stdout, /Stable worktree already exists/);

  fs.renameSync(fixture.remote, `${fixture.remote}.offline`);
  const offlineIdempotent = await runCli([
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
  assert.equal(offlineIdempotent.status, 0, offlineIdempotent.stderr);
  assert.match(offlineIdempotent.stdout, /Repository unchanged/);

  const differentFixture = createRemoteWithBranch("main");
  const conflict = await runCli([
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    differentFixture.remote,
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

  const credentialUrl = await runCli([
    "repo",
    "add",
    "credential-url",
    "--workspace",
    workspace,
    "--url",
    "https://secret@example.invalid/app.git",
    "--integration-branch",
    "main",
    "--no-clone",
  ]);
  assert.equal(credentialUrl.status, 2);
  assert.match(credentialUrl.stderr, /must not embed credentials/);
});

test("repository registration recovers an interrupted anchor setup", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Recovery Example",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const command = [
    "repo",
    "add",
    "app",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main",
  ];
  assert.equal((await runCli([...command, "--no-clone"])).status, 0);
  const anchor = path.join(workspace, "repositories", "app", ".bare");
  runGit(["init", "--bare", anchor], workspace);

  const recovered = await runCli(command);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(runGit(["remote", "get-url", "origin"], anchor), fixture.remote);
  assert.ok(fs.existsSync(path.join(workspace, "repositories", "app", "main")));
});

test("worktree removal refuses unpushed commits but allows a published recovery point", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Recovery Safety",
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
  assert.equal(
    (
      await runCli([
        "worktree",
        "new",
        "app",
        "local-change",
        "--workspace",
        workspace,
      ])
    ).status,
    0,
  );
  const feature = path.join(workspace, "repositories", "app", "local-change");
  runGit(["config", "user.name", "Synthetic Tester"], feature);
  runGit(["config", "user.email", "synthetic@example.invalid"], feature);
  runGit(["config", "commit.gpgSign", "false"], feature);
  fs.writeFileSync(
    path.join(feature, "change.txt"),
    "durable change\n",
    "utf8",
  );
  runGit(["add", "change.txt"], feature);
  runGit(["commit", "-m", "test: add recoverable change"], feature);

  const removal = [
    "worktree",
    "remove",
    "app",
    "local-change",
    "--workspace",
    workspace,
    "--execute",
    "--confirm",
    "app/local-change",
    "--reason",
    "no-longer-needed",
  ];
  const refused = await runCli(removal);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /not recoverable from its upstream/);
  assert.ok(fs.existsSync(feature));

  runGit(["push", "-u", "origin", "work/local-change"], feature);
  const removed = await runCli(removal);
  if (process.platform === "win32") {
    assert.equal(removed.status, 2);
    assert.match(removed.stderr, /could not verify/);
    assert.ok(fs.existsSync(feature));
  } else {
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(fs.existsSync(feature), false);
  }
  const anchor = path.join(workspace, "repositories", "app", ".bare");
  assert.equal(
    runGit(["show-ref", "--verify", "refs/heads/work/local-change"], anchor)
      .length > 0,
    true,
  );
});
