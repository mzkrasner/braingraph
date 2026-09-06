import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import {
  createRemoteWithBranch,
  runCli,
  repositoryRoot,
  temporaryDirectory,
} from "./helpers.js";

const CLAUDE_ADAPTER = "@AGENTS.md\n";

test("init creates canonical instructions with import-only Claude adapters", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const result = await runCli([
    "init",
    workspace,
    "--name",
    "Compatible Workspace",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    fs.readFileSync(path.join(workspace, "CLAUDE.md"), "utf8"),
    CLAUDE_ADAPTER,
  );
  assert.equal(
    fs.readFileSync(path.join(workspace, "Knowledge", "CLAUDE.md"), "utf8"),
    CLAUDE_ADAPTER,
  );
  const instructions = fs.readFileSync(
    path.join(workspace, "AGENTS.md"),
    "utf8",
  );
  assert.match(instructions, /\.agents\/skills\/<skill>\/SKILL\.md/);
  assert.match(
    instructions,
    /Codex, Cursor, and Grok Build discover the canonical instructions and skills directly/,
  );
});

test("fictional behavior cases resolve distinct source files without entering canonical knowledge", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Fixture Test"])).status,
    0,
  );
  const pack = path.join(workspace, "Knowledge", "evals", "behavior");
  const fixtures = JSON.parse(
    fs.readFileSync(path.join(pack, "fixtures.json"), "utf8"),
  ) as {
    version: number;
    brains: {
      directory: string;
      name: string;
      description: string;
      notes: string;
    }[];
  };
  const cases = JSON.parse(
    fs.readFileSync(path.join(pack, "cases.json"), "utf8"),
  ) as {
    cases: {
      id: string;
      skill: string;
      allowedBrains: string[];
      request: string;
    }[];
  };
  assert.equal(fixtures.version, 1);
  assert.equal(
    new Set(fixtures.brains.map((brain) => brain.directory)).size,
    2,
  );
  assert.equal(
    new Set(cases.cases.map((item) => item.id)).size,
    cases.cases.length,
  );
  for (const brain of fixtures.brains) {
    const notes = path.resolve(pack, brain.notes);
    assert.ok(notes.startsWith(`${pack}${path.sep}`));
    assert.ok(fs.existsSync(path.join(notes, "wiki", "Membership.md")));
    assert.ok(fs.existsSync(path.join(notes, "wiki", "Intake.md")));
  }
  for (const item of cases.cases) {
    assert.ok(item.request.length > 0);
    assert.ok(
      fs.existsSync(
        path.join(workspace, ".agents", "skills", item.skill, "SKILL.md"),
      ),
    );
    assert.ok(
      item.allowedBrains.every((allowed) =>
        fixtures.brains.some((brain) => brain.directory === allowed),
      ),
    );
  }
  assert.ok(fs.existsSync(path.join(pack, "rubric.md")));
  assert.deepEqual(
    fs.readdirSync(path.join(workspace, "Knowledge", "wiki")),
    [],
  );
  assert.ok(
    fs.existsSync(
      path.join(
        repositoryRoot,
        "templates",
        "core",
        "skills",
        "braingraph-query",
        "SKILL.md",
      ),
    ),
  );
});

test("repository hubs receive the same canonical instruction contract", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (
      await runCli([
        "init",
        workspace,
        "--name",
        "Software Workspace",
        "--profile",
        "software",
      ])
    ).status,
    0,
  );
  const fixture = createRemoteWithBranch("main");
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

  assert.equal(result.status, 0, result.stderr);
  const hub = path.join(workspace, "repositories", "app");
  assert.ok(fs.existsSync(path.join(hub, "AGENTS.md")));
  assert.equal(
    fs.readFileSync(path.join(hub, "CLAUDE.md"), "utf8"),
    CLAUDE_ADAPTER,
  );
});

test("doctor rejects instruction adapter drift", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Drift Example"])).status,
    0,
  );
  fs.writeFileSync(
    path.join(workspace, "CLAUDE.md"),
    "@AGENTS.md\n\nUse different policy.\n",
    "utf8",
  );

  const result = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /instructions:workspace:claude-adapter/);
  assert.match(result.stdout, /must contain only @AGENTS\.md/);
});

test("doctor reports a non-file instruction adapter without crashing", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Malformed Adapter"])).status,
    0,
  );
  const adapter = path.join(workspace, "CLAUDE.md");
  fs.rmSync(adapter);
  fs.mkdirSync(adapter);

  const result = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /instructions:workspace:claude-adapter/);
  assert.match(result.stdout, /must contain only @AGENTS\.md/);
});

test("doctor warns about duplicate vendor skill mirrors", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Skill Example"])).status,
    0,
  );
  for (const root of [".agents/skills", ".claude/skills"]) {
    const skill = path.join(workspace, root, "example", "SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, "# Example\n", "utf8");
  }

  const result = await runCli(["doctor", workspace], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[warning\] agent-skills:vendor-mirrors/);
  assert.match(result.stdout, /\.claude\/skills\/example/);
});
