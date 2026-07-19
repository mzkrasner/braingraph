import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test, vi } from "vitest";

import { assertSafeRepositoryUrl } from "../src/commands/repo.js";
import { inspectProcessesUsing } from "../src/commands/worktree.js";
import { writeJsonAtomic } from "../src/files.js";
import { commandExists, resolveCommandInvocation } from "../src/process.js";

import {
  createRemoteWithBranch,
  readWorkspaceManifest,
  runCli,
  runGit,
  temporaryDirectory,
} from "./helpers.js";

test("init refuses a linked knowledge destination before any workspace write", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const outside = path.join(root, "outside");
  fs.mkdirSync(workspace);
  fs.mkdirSync(outside);
  linkDirectory(outside, path.join(workspace, "Knowledge"));

  const result = await runCli(["init", workspace, "--name", "Boundary"]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /resolves outside/);
  assert.equal(fs.existsSync(path.join(workspace, "braingraph.json")), false);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("repository registration refuses a linked hub without mutating the manifest", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const outside = path.join(root, "outside");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Repository Boundary",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  fs.mkdirSync(outside);
  linkDirectory(outside, path.join(workspace, "repositories", "app"));

  const result = await runCli([
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

  assert.equal(result.status, 2);
  assert.match(result.stderr, /resolves outside/);
  assert.equal(readWorkspaceManifest(workspace).repositories.app, undefined);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("QMD refuses linked state and skill destinations outside the workspace", async () => {
  for (const destination of [".qmd", ".agents"]) {
    const root = temporaryDirectory();
    const workspace = path.join(root, "workspace");
    const outside = path.join(root, "outside");
    assert.equal(
      (await runCli(["init", workspace, "--name", "QMD Boundary"])).status,
      0,
    );
    fs.mkdirSync(outside);
    const linked = path.join(workspace, destination);
    fs.rmSync(linked, { recursive: true, force: true });
    linkDirectory(outside, linked);

    const result = await runCli(["qmd", "configure", workspace, "--dry-run"]);
    assert.equal(result.status, 2, destination);
    assert.match(result.stderr, /resolves outside/);
    assert.deepEqual(fs.readdirSync(outside), []);

    const doctor = await runCli(["doctor", workspace]);
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /containment/);
  }
});

test("generated Git internals and worktrees are ignored by an outer repository", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Outer Repository",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  runGit(["init"], workspace);
  const result = await runCli([
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
  assert.equal(result.status, 0, result.stderr);

  assert.equal(
    runGit(["check-ignore", "-q", "repositories/app/.bare/HEAD"], workspace),
    "",
  );
  assert.equal(
    runGit(
      ["check-ignore", "-q", "repositories/app/main/README.md"],
      workspace,
    ),
    "",
  );
  const status = runGit(
    ["status", "--short", "--untracked-files=all"],
    workspace,
  );
  assert.doesNotMatch(status, /\.bare|repositories\/app\/main/);
  assert.match(status, /repositories\/app\/AGENTS\.md/);
});

test("repository registration rejects unsafe remotes and invalid refs without persistence", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Repository Validation",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );

  for (const unsafe of [
    "https://example.invalid/app.git?token=secret",
    "https://example.invalid/app.git#fragment",
    "https://example.invalid/`app`.git",
    "ftp://example.invalid/app.git",
  ]) {
    const result = await runCli([
      "repo",
      "add",
      "unsafe",
      "--workspace",
      workspace,
      "--url",
      unsafe,
      "--integration-branch",
      "main",
      "--no-clone",
    ]);
    assert.equal(result.status, 2, unsafe);
  }

  const invalidRef = await runCli([
    "repo",
    "add",
    "invalid-ref",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main..invalid",
    "--no-clone",
  ]);
  assert.equal(invalidRef.status, 2);
  assert.match(invalidRef.stderr, /valid Git branch/);

  const missingRef = await runCli([
    "repo",
    "add",
    "missing-ref",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "missing",
    "--no-clone",
  ]);
  assert.equal(missingRef.status, 2);
  assert.match(missingRef.stderr, /remote branch is unavailable/);

  const invalidPrefix = await runCli([
    "repo",
    "add",
    "invalid-prefix",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main",
    "--branch-prefix",
    "feature",
    "--no-clone",
  ]);
  assert.equal(invalidPrefix.status, 2);
  assert.match(invalidPrefix.stderr, /branch prefix/);

  const missingProduction = await runCli([
    "repo",
    "add",
    "missing-production",
    "--workspace",
    workspace,
    "--url",
    fixture.remote,
    "--integration-branch",
    "main",
    "--production-branch",
    "production",
    "--no-clone",
  ]);
  assert.equal(missingProduction.status, 2);
  assert.match(missingProduction.stderr, /remote branch is unavailable/);
  assert.deepEqual(readWorkspaceManifest(workspace).repositories, {});
  assert.deepEqual(fs.readdirSync(path.join(workspace, "repositories")), [
    "README.md",
  ]);
});

test("repository URL validation accepts supported credential-free remote forms", () => {
  const local = path.join(temporaryDirectory(), "repository.git");
  for (const remote of [
    "https://example.invalid/organization/repository.git",
    "http://example.invalid/organization/repository.git",
    "ssh://git@example.invalid/organization/repository.git",
    "git://example.invalid/organization/repository.git",
    "file:///tmp/synthetic-repository.git",
    "git@example.invalid:organization/repository.git",
    local,
    "./synthetic-repository.git",
  ]) {
    assert.equal(assertSafeRepositoryUrl(remote), remote);
  }
});

test.skipIf(process.platform === "win32")(
  "worktree process inspection fails closed when lsof is unavailable or errors",
  () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = temporaryDirectory();
      const missing = inspectProcessesUsing("/tmp/synthetic-worktree");
      assert.equal(missing.status, "unknown");
      assert.match(missing.reason ?? "", /lsof is not installed/);

      const bin = temporaryDirectory();
      const fake = path.join(bin, "lsof");
      fs.writeFileSync(
        fake,
        "#!/bin/sh\nprintf 'permission denied\\n' >&2\nexit 2\n",
        {
          encoding: "utf8",
          mode: 0o755,
        },
      );
      process.env.PATH = bin;
      const failed = inspectProcessesUsing("/tmp/synthetic-worktree");
      assert.equal(failed.status, "unknown");
      assert.match(failed.reason ?? "", /permission denied/);

      fs.writeFileSync(
        fake,
        "#!/bin/sh\nprintf 'p123\\nn/tmp/synthetic-worktree/child\\np456\\nn/tmp/unrelated\\n'\n",
        { encoding: "utf8", mode: 0o755 },
      );
      const inUse = inspectProcessesUsing("/tmp/synthetic-worktree");
      assert.equal(inUse.status, "in-use");
      assert.deepEqual(inUse.processes, [
        { pid: "123", cwd: "/tmp/synthetic-worktree/child" },
      ]);
    } finally {
      process.env.PATH = originalPath;
    }
  },
);

test("worktree process inspection fails closed on unsupported platforms", () => {
  const inspection = inspectProcessesUsing("C:\\synthetic-worktree", "win32");

  assert.equal(inspection.status, "unknown");
  assert.match(inspection.reason ?? "", /unavailable on Windows/);
  assert.deepEqual(inspection.processes, []);
});

test("atomic JSON writes preserve restrictive existing file modes", () => {
  const root = temporaryDirectory();
  for (const mode of [0o600, 0o640]) {
    const file = path.join(root, `manifest-${mode.toString(8)}.json`);
    fs.writeFileSync(file, "{}\n", { encoding: "utf8", mode });
    if (process.platform !== "win32") fs.chmodSync(file, mode);
    writeJsonAtomic(file, { updated: true }, root);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(file).mode & 0o777, mode);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
      updated: true,
    });
  }
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.includes(".tmp-")),
    [],
  );
});

test("atomic JSON writes remove temporary files after replacement failures", () => {
  const root = temporaryDirectory();
  const file = path.join(root, "manifest.json");
  const rename = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
    throw new Error("synthetic rename failure");
  });
  try {
    assert.throws(() => {
      writeJsonAtomic(file, { synthetic: true }, root);
    }, /synthetic rename failure/);
  } finally {
    rename.mockRestore();
  }
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(
    fs.readdirSync(root).filter((name) => name.includes(".tmp-")),
    [],
  );
});

test("knowledge directories reject root and reserved collisions but allow nesting", async () => {
  for (const reserved of [
    ".",
    ".qmd",
    "repositories",
    "schemas/nested",
    "AGENTS.md",
    "CLAUDE.md",
    "braingraph.json",
  ]) {
    const workspace = path.join(temporaryDirectory(), "workspace");
    const result = await runCli([
      "init",
      workspace,
      "--name",
      "Reserved Knowledge",
      "--knowledge-dir",
      reserved,
    ]);
    assert.equal(result.status, 2, reserved);
    assert.match(result.stderr, /non-reserved directory/);
  }

  const workspace = path.join(temporaryDirectory(), "workspace");
  const nested = await runCli([
    "init",
    workspace,
    "--name",
    "Nested Knowledge",
    "--knowledge-dir",
    "notes/vault",
  ]);
  assert.equal(nested.status, 0, nested.stderr);
  assert.ok(
    fs.existsSync(path.join(workspace, "notes", "vault", "Start Here.md")),
  );
  const doctor = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(doctor.status, 0, doctor.stderr);

  const manifestPath = path.join(workspace, "braingraph.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    knowledge: { directory: string };
  };
  manifest.knowledge.directory = ".";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const invalidDoctor = await runCli(["doctor", workspace]);
  assert.equal(invalidDoctor.status, 2);
  assert.match(invalidDoctor.stderr, /distinct non-reserved directory/);
});

test("executable discovery treats metacharacters literally and supports PATHEXT", () => {
  const root = temporaryDirectory();
  const marker = path.join(root, "marker");
  assert.equal(commandExists(`missing;touch ${marker}`), false);
  assert.equal(fs.existsSync(marker), false);

  const executable = path.join(root, "synthetic.EXE");
  fs.writeFileSync(executable, "synthetic", "utf8");
  assert.equal(
    commandExists("synthetic", "win32", {
      PATH: root,
      PATHEXT: ".EXE;.CMD",
    }),
    true,
  );
});

test("Windows command resolution uses native executables or PowerShell companions", () => {
  const root = temporaryDirectory();
  const native = path.join(root, "native.EXE");
  fs.writeFileSync(native, "synthetic", "utf8");
  assert.deepEqual(
    resolveCommandInvocation("native", ["argument"], "win32", {
      Path: root,
      PathExt: ".EXE",
    }),
    { command: native, args: ["argument"] },
  );
  assert.deepEqual(
    resolveCommandInvocation("missing", ["argument"], "win32", {
      PATH: root,
      PATHEXT: ".EXE",
    }),
    { command: "missing", args: ["argument"] },
  );
  assert.deepEqual(
    resolveCommandInvocation("native", ["argument"], "linux", {}),
    { command: "native", args: ["argument"] },
  );

  const shim = path.join(root, "qmd.CMD");
  const companion = path.join(root, "qmd.ps1");
  const powerShell = path.join(root, "powershell.exe");
  fs.writeFileSync(shim, "synthetic", "utf8");
  fs.writeFileSync(companion, "synthetic", "utf8");
  fs.writeFileSync(powerShell, "synthetic", "utf8");
  const resolved = resolveCommandInvocation("qmd", ["status"], "win32", {
    PATH: root,
    PATHEXT: "CMD",
  });
  assert.equal(resolved.command, powerShell);
  assert.deepEqual(resolved.args.slice(-2), [companion, "status"]);

  fs.rmSync(companion);
  assert.throws(
    () =>
      resolveCommandInvocation("qmd", [], "win32", {
        PATH: root,
        PATHEXT: ".CMD",
      }),
    /without a PowerShell companion/,
  );
  fs.writeFileSync(companion, "synthetic", "utf8");
  fs.rmSync(powerShell);
  assert.throws(
    () =>
      resolveCommandInvocation("qmd", [], "win32", {
        PATH: root,
        PATHEXT: ".CMD",
      }),
    /PowerShell is required/,
  );
});

test("doctor reports wrong artifact types instead of accepting existence", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Artifact Types"])).status,
    0,
  );
  const expectedFile = path.join(workspace, "Knowledge", "Start Here.md");
  fs.rmSync(expectedFile);
  fs.mkdirSync(expectedFile);

  const result = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /vault:Start Here\.md/);
  assert.match(result.stdout, /expected file/);
});

test("doctor validates Obsidian, skill, and managed repository artifact types", async () => {
  const coreWorkspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", coreWorkspace, "--name", "Artifact Coverage"]))
      .status,
    0,
  );
  const obsidianFile = path.join(
    coreWorkspace,
    "Knowledge",
    ".obsidian",
    "app.json",
  );
  fs.rmSync(obsidianFile);
  fs.mkdirSync(obsidianFile);
  const skillDirectory = path.join(coreWorkspace, ".agents", "skills");
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.writeFileSync(path.join(skillDirectory, "malformed"), "not a directory\n");

  const coreDoctor = await runCli(["doctor", coreWorkspace]);
  assert.equal(coreDoctor.status, 1);
  assert.match(coreDoctor.stdout, /vault:\.obsidian\/app\.json/);
  assert.match(coreDoctor.stdout, /agent-skills:malformed:directory/);

  const managedWorkspace = path.join(temporaryDirectory(), "workspace");
  const fixture = createRemoteWithBranch("main");
  assert.equal(
    (
      await runCli([
        "init",
        managedWorkspace,
        "--name",
        "Managed Artifacts",
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
        managedWorkspace,
        "--url",
        fixture.remote,
        "--integration-branch",
        "main",
      ])
    ).status,
    0,
  );
  const hub = path.join(managedWorkspace, "repositories", "app");
  for (const relative of [".bare", "main"]) {
    const artifact = path.join(hub, relative);
    fs.rmSync(artifact, { recursive: true, force: true });
    fs.writeFileSync(artifact, "not a directory\n");
  }
  const managedDoctor = await runCli(["doctor", managedWorkspace]);
  assert.equal(managedDoctor.status, 1);
  assert.match(managedDoctor.stdout, /repository:app:anchor/);
  assert.match(managedDoctor.stdout, /repository:app:stable-worktree/);

  const hubWorkspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (
      await runCli([
        "init",
        hubWorkspace,
        "--name",
        "Hub Artifact",
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
        hubWorkspace,
        "--url",
        fixture.remote,
        "--integration-branch",
        "main",
        "--no-clone",
      ])
    ).status,
    0,
  );
  const malformedHub = path.join(hubWorkspace, "repositories", "app");
  fs.rmSync(malformedHub, { recursive: true, force: true });
  fs.writeFileSync(malformedHub, "not a directory\n");
  const hubDoctor = await runCli(["doctor", hubWorkspace]);
  assert.equal(hubDoctor.status, 1);
  assert.match(hubDoctor.stdout, /repository:app:hub/);
});

function linkDirectory(target: string, destination: string): void {
  fs.symlinkSync(
    target,
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
}
