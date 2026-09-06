import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test, vi } from "vitest";

import { runBounded } from "../src/bounded-process.js";
import { withQmdLock } from "../src/qmd-runtime.js";
import { sameCanonicalPath } from "../src/util.js";

import {
  parseJsonObject,
  runCli,
  temporaryDirectory,
  writeNodeExecutable,
} from "./helpers.js";

test("QMD configuration dry run uses the declared vault, collection, and mask", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");\nelse if (process.argv.includes("show")) process.exit(1);\n',
  );
  assert.equal(
    (await runCli(["init", workspace, "--name", "QMD Example"])).status,
    0,
  );

  const result = await runCli(["qmd", "configure", workspace, "--dry-run"], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qmd collection add/);
  assert.match(result.stdout, /qmd-example-brain/);
  assert.match(result.stdout, /domains\/\*\*\/\*\.md/);
  assert.match(result.stdout, /qmd skill install/);
  assert.match(result.stdout, /qmd context add/);
  assert.match(result.stdout, /Durable knowledge workspace for QMD Example/);
  assert.match(result.stdout, /qmd embed/);
});

test("QMD configuration can be planned before QMD is installed", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Fresh Machine"])).status,
    0,
  );

  const result = await runCli(["qmd", "configure", workspace, "--dry-run"], {
    env: { PATH: "/usr/bin:/bin" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qmd collection add/);
  assert.match(result.stdout, /qmd context add/);
});

test("QMD configuration rejects unsupported and malformed installed versions", async () => {
  for (const version of ["qmd 2.5.2", "qmd 3.0.0", "unexpected output"]) {
    const root = temporaryDirectory();
    const workspace = path.join(root, "workspace");
    const bin = path.join(root, "bin");
    writeNodeExecutable(
      bin,
      "qmd",
      `console.log(${JSON.stringify(version)});\n`,
    );
    assert.equal(
      (await runCli(["init", workspace, "--name", "Version Check"])).status,
      0,
    );
    const result = await runCli(["qmd", "configure", workspace, "--dry-run"], {
      env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
    });
    assert.equal(result.status, 2, version);
    assert.match(result.stderr, /QMD 2\.5\.3 or newer/);
  }
});

test("QMD configuration refuses to reuse a conflicting collection", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  fs.mkdirSync(path.join(workspace, ".qmd"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".qmd", "index.yml"), "version: 1\n");
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");\nelse if (process.argv.includes("show")) { console.log("Collection: conflict\\n  Path: /different\\n  Pattern: **/*.md"); process.exit(0); }\n',
  );
  assert.equal(
    (await runCli(["init", workspace, "--name", "QMD Example"])).status,
    0,
  );
  const result = await runCli(["qmd", "configure", workspace, "--dry-run"], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /different path or mask/);
});

test("QMD configuration preserves a matching collection", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  assert.equal(
    (await runCli(["init", workspace, "--name", "QMD Example"])).status,
    0,
  );
  const vault = path.join(workspace, "Knowledge");
  fs.mkdirSync(path.join(workspace, ".qmd"));
  fs.writeFileSync(path.join(workspace, ".qmd", "index.yml"), "version: 1\n");
  writeNodeExecutable(
    bin,
    "qmd",
    `if (process.argv.includes("--version")) console.log("qmd 2.5.3");\nelse console.log(${JSON.stringify(`Path: ${vault}\nPattern: {projects/**/*.md,domains/**/*.md,wiki/**/*.md,reports/**/*.md}`)});\n`,
  );

  const result = await runCli(["qmd", "configure", workspace, "--dry-run"], {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /collection already matches/);
  assert.doesNotMatch(result.stdout, /collection add/);
});

test("QMD refresh can plan both index and embedding updates", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");\n',
  );
  assert.equal(
    (await runCli(["init", workspace, "--name", "Refresh Example"])).status,
    0,
  );
  fs.mkdirSync(path.join(workspace, ".qmd"));
  fs.writeFileSync(path.join(workspace, ".qmd", "index.yml"), "version: 1\n");

  const result = await runCli(
    ["qmd", "refresh", workspace, "--dry-run", "--embed"],
    { env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qmd update/);
  assert.match(result.stdout, /qmd embed -c refresh-example-brain/);
});

test("QMD execution is workspace-local and idempotent", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  const log = path.join(root, "qmd-calls.jsonl");
  const unrelated = path.join(root, "unrelated-qmd-index");
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, "sentinel"), "preserve\n", "utf8");
  writeNodeExecutable(bin, "qmd", fakeExecutable(log, unrelated));
  assert.equal(
    (await runCli(["init", workspace, "--name", "Local QMD"])).status,
    0,
  );
  const environment = {
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    HOME: root,
    PWD: unrelated,
  };

  const first = await runCli(["qmd", "configure", workspace, "--no-embed"], {
    env: environment,
  });
  assert.equal(first.status, 0, first.stderr);
  const second = await runCli(["qmd", "configure", workspace, "--no-embed"], {
    env: environment,
  });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /collection already matches/);
  assert.match(second.stdout, /skill already matches/);

  const calls = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map(parseJsonObject);
  assert.ok(calls.length > 0);
  assert.ok(
    calls.every(
      (call) =>
        typeof call.cwd === "string" &&
        sameCanonicalPath(call.cwd, workspace) &&
        typeof call.pwd === "string" &&
        sameCanonicalPath(call.pwd, workspace),
    ),
  );
  assert.equal(
    calls.filter((call) => JSON.stringify(call.args) === '["init"]').length,
    1,
  );
  assert.equal(
    calls.filter((call) => JSON.stringify(call.args) === '["skill","install"]')
      .length,
    1,
  );
  assert.ok(fs.existsSync(path.join(workspace, ".qmd", "index.yml")));
  assert.equal(
    fs.readFileSync(path.join(unrelated, "sentinel"), "utf8"),
    "preserve\n",
  );
  assert.equal(fs.existsSync(path.join(unrelated, "unexpected-update")), false);
});

function fakeExecutable(log: string, unrelated: string): string {
  return `const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), pwd: process.env.PWD, args }) + "\\n");
if (args[0] === "--version") {
  console.log("qmd 2.5.3");
} else if (args[0] === "init") {
  const target = process.env.PWD || process.cwd();
  fs.mkdirSync(path.join(target, ".qmd"), { recursive: true });
  fs.writeFileSync(path.join(target, ".qmd", "index.yml"), "collections: {}\\n");
} else if (args[0] === "collection" && args[1] === "show") {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "braingraph.json"), "utf8"));
  console.log("Path: " + path.join(process.cwd(), manifest.knowledge.directory));
  console.log("Pattern: {" + manifest.knowledge.qmd.include.join(",") + "}");
} else if (args[0] === "skill" && args[1] === "install") {
  const skill = path.join(process.cwd(), ".agents", "skills", "qmd", "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, "---\\nname: qmd\\n---\\nRun qmd skill show before retrieval.\\n");
} else if (args[0] === "update" && !fs.existsSync(path.join(process.cwd(), ".qmd", "index.yml"))) {
  fs.writeFileSync(${JSON.stringify(path.join(unrelated, "unexpected-update"))}, "cross-workspace mutation\\n");
}
`;
}

test("two brains with the same collection name remain isolated from an unrelated caller", async () => {
  const root = temporaryDirectory();
  const bin = path.join(root, "bin");
  const caller = path.join(root, "caller");
  fs.mkdirSync(path.join(caller, ".qmd"), { recursive: true });
  const sentinel = path.join(caller, ".qmd", "index.yml");
  fs.writeFileSync(sentinel, "do not use the caller index\n");
  const log = path.join(root, "calls.jsonl");
  writeNodeExecutable(bin, "qmd", fakeExecutable(log, caller));
  const env = {
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    PWD: caller,
  };
  for (const directory of ["first", "second"]) {
    const workspace = path.join(root, directory);
    assert.equal(
      (await runCli(["init", workspace, "--name", "Shared Name"])).status,
      0,
    );
    const result = await runCli(["qmd", "configure", workspace, "--no-embed"], {
      cwd: caller,
      env,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(workspace, ".qmd", "index.yml")));
    const search = await runCli(
      ["qmd", "search", workspace, "--text", "fictional policy"],
      { cwd: caller, env },
    );
    assert.equal(search.status, 0, search.stderr);
  }
  assert.equal(
    fs.readFileSync(sentinel, "utf8"),
    "do not use the caller index\n",
  );
  const calls = fs
    .readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map(parseJsonObject);
  assert.ok(
    calls.every(
      (entry) =>
        typeof entry.cwd === "string" && !sameCanonicalPath(entry.cwd, caller),
    ),
  );
  const searches = calls.filter(
    (entry) => Array.isArray(entry.args) && entry.args[0] === "search",
  );
  assert.equal(searches.length, 2);
  assert.ok(
    searches.every(
      (entry) =>
        JSON.stringify(entry.args) ===
        '["search","fictional policy","-c","shared-name-brain","-n","10"]',
    ),
  );
});

test("QMD configure stops if init succeeds without creating the exact target config", async () => {
  const { workspace, bin, env } = await qmdFixture();
  const log = path.join(bin, "called.jsonl");
  writeNodeExecutable(
    bin,
    "qmd",
    `require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + "\\n"); if (process.argv.includes("--version")) console.log("qmd 2.5.3");`,
  );
  fs.unlinkSync(path.join(workspace, ".qmd", "index.yml"));
  const result = await runCli(["qmd", "configure", workspace], { env });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /QMD init must create the target/);
  assert.equal(fs.readFileSync(log, "utf8"), '["--version"]\n["init"]\n');
  assert.equal(
    fs.existsSync(path.join(workspace, ".qmd", "operation.lock")),
    false,
  );
  assert.equal(
    parseJsonObject(
      fs.readFileSync(
        path.join(workspace, ".qmd", "last-operation.json"),
        "utf8",
      ),
    ).status,
    "failed",
  );
});

test("QMD overrides and unsafe state stop commands and doctor before any QMD probe", async () => {
  const { workspace, bin, env } = await qmdFixture();
  const log = path.join(bin, "unexpected-call");
  writeNodeExecutable(
    bin,
    "qmd",
    `require("node:fs").writeFileSync(${JSON.stringify(log)}, "called");`,
  );
  for (const key of ["INDEX_PATH", "QMD_CONFIG_DIR", "QMD_SKILLS_DIR"]) {
    const overrides = { ...env, [key]: path.join(bin, "another-brain") };
    const refresh = await runCli(["qmd", "refresh", workspace, "--dry-run"], {
      env: overrides,
    });
    assert.equal(refresh.status, 2);
    assert.match(refresh.stderr, /external index overrides/);
    const doctor = await runCli(["doctor", workspace], { env: overrides });
    assert.equal(doctor.status, 1);
    assert.match(doctor.stdout, /qmd:safety/);
  }
  const outside = path.join(bin, "protected-data");
  fs.writeFileSync(outside, "preserve\n");
  for (const name of [
    "index.sqlite",
    "index.sqlite-wal",
    "index.sqlite-shm",
    "index.sqlite-journal",
  ]) {
    const link = path.join(workspace, ".qmd", name);
    fs.linkSync(outside, link);
    const refresh = await runCli(["qmd", "refresh", workspace], { env });
    assert.equal(refresh.status, 2, name);
    assert.match(refresh.stderr, /unlinked file/);
    assert.equal((await runCli(["doctor", workspace], { env })).status, 1);
    fs.unlinkSync(link);
  }
  assert.equal(fs.existsSync(log), false);
  assert.equal(fs.readFileSync(outside, "utf8"), "preserve\n");
});

test("QMD rejects extra collections, update hooks, and ambiguous or malformed YAML", async () => {
  const { workspace, bin, env } = await qmdFixture();
  const config = path.join(workspace, ".qmd", "index.yml");
  const log = path.join(bin, "unexpected-call");
  writeNodeExecutable(
    bin,
    "qmd",
    `require("node:fs").writeFileSync(${JSON.stringify(log)}, "called");`,
  );
  const collection = {
    path: path.join(workspace, "Knowledge"),
    pattern: "{projects/**/*.md,domains/**/*.md,wiki/**/*.md,reports/**/*.md}",
  };
  const invalid = [
    "collections: {}\ncollections: {}\n",
    "collections: [\n",
    "- not a mapping\n",
    "collections: []\n",
    "indexPath: /another-brain\n",
    "models: &shared {}\ncollections: *shared\n",
    JSON.stringify({ collections: { unrelated: collection } }),
    JSON.stringify({ collections: { "fixture-brain": "invalid" } }),
    JSON.stringify({
      collections: { "fixture-brain": { ...collection, path: bin } },
    }),
    JSON.stringify({
      collections: {
        "fixture-brain": { ...collection, update: "arbitrary external write" },
      },
    }),
  ];
  for (const content of invalid) {
    fs.writeFileSync(config, content);
    const result = await runCli(["qmd", "refresh", workspace], { env });
    assert.equal(result.status, 2, `${content}\n${result.stderr}`);
  }
  fs.writeFileSync(config, "collections: {}\n");
  fs.writeFileSync(
    path.join(workspace, ".qmd", "index.yaml"),
    "collections: {}\n",
  );
  assert.equal(
    (await runCli(["qmd", "refresh", workspace], { env })).status,
    2,
  );
  assert.equal(fs.existsSync(log), false);
});

test("QMD configuration refuses a linked vault before initialization or any probe", async () => {
  const { workspace, bin, env } = await qmdFixture();
  const vault = path.join(workspace, "Knowledge");
  const outside = path.join(bin, "outside-vault");
  fs.mkdirSync(outside);
  fs.renameSync(vault, path.join(workspace, "preserved-vault"));
  fs.symlinkSync(
    outside,
    vault,
    process.platform === "win32" ? "junction" : "dir",
  );
  fs.unlinkSync(path.join(workspace, ".qmd", "index.yml"));
  const log = path.join(bin, "unexpected-call");
  writeNodeExecutable(
    bin,
    "qmd",
    `require("node:fs").writeFileSync(${JSON.stringify(log)}, "called");`,
  );
  for (const flags of [[], ["--dry-run"]]) {
    const result = await runCli(["qmd", "configure", workspace, ...flags], {
      env,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /outside the workspace/);
  }
  assert.equal(fs.existsSync(log), false);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(
    fs.existsSync(path.join(workspace, ".qmd", "operation.lock")),
    false,
  );
});

test.skipIf(process.platform === "win32")(
  "QMD refuses symlinked database and sidecar files before probing",
  async () => {
    const { workspace, bin, env } = await qmdFixture();
    const outside = path.join(bin, "protected-index");
    fs.writeFileSync(outside, "preserve\n");
    for (const name of [
      "index.sqlite",
      "index.sqlite-wal",
      "index.sqlite-shm",
    ]) {
      const linked = path.join(workspace, ".qmd", name);
      fs.symlinkSync(outside, linked);
      const result = await runCli(["qmd", "refresh", workspace], { env });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /outside the workspace/);
      fs.unlinkSync(linked);
    }
    assert.equal(fs.readFileSync(outside, "utf8"), "preserve\n");
  },
);

test("QMD retrieval allows only bounded manifest-scoped commands", async () => {
  const { workspace, bin, env } = await qmdFixture();
  writeNodeExecutable(
    bin,
    "qmd",
    'const args = process.argv.slice(2); if (args[0] === "--version") console.log("qmd 2.5.3"); else console.log(JSON.stringify(args));',
  );
  const query = await runCli(
    ["qmd", "query", workspace, "--text", "fictional decision", "--limit", "5"],
    { env },
  );
  assert.equal(query.status, 0, query.stderr);
  assert.equal(
    query.stdout.trim(),
    '["query","fictional decision","-c","fixture-brain","-n","5"]',
  );
  const get = await runCli(
    ["qmd", "get", workspace, "--text", "qmd://fixture-brain/wiki/Example.md"],
    { env },
  );
  assert.equal(get.status, 0, get.stderr);
  for (const args of [
    ["search", "--text=--index=other"],
    ["search", "--text", "policy", "--index", "other"],
    ["search", "--text", "policy", "--limit", "0"],
    ["search", "--text", "policy", "--limit", "201"],
    ["get", "--text", "qmd://different-brain/wiki/Example.md"],
    ["get", "--text", "#document-id"],
    ["get", "--text", "qmd://fixture-brain/wiki/Example.md?index=global"],
    ["get", "--text", "qmd://fixture-brain/../other/document.md"],
  ])
    assert.equal(
      (await runCli(["qmd", ...args, workspace], { env })).status,
      2,
      JSON.stringify(args),
    );
});

test("workspace-local locks prevent overlap without blocking another brain or mutating dry runs", async () => {
  const { workspace, env } = await qmdFixture();
  const other = path.join(temporaryDirectory(), "other");
  assert.equal((await runCli(["init", other, "--name", "Other"])).status, 0);
  await withQmdLock(workspace, "refresh", async () => {
    await assert.rejects(
      withQmdLock(workspace, "configure", () => Promise.resolve()),
      /already locked/,
    );
    await withQmdLock(other, "refresh", () => Promise.resolve());
    const dryRun = await runCli(["qmd", "refresh", workspace, "--dry-run"], {
      env,
    });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.ok(fs.existsSync(path.join(workspace, ".qmd", "operation.lock")));
  });
  assert.equal(
    fs.existsSync(path.join(workspace, ".qmd", "operation.lock")),
    false,
  );
  assert.equal(
    parseJsonObject(
      fs.readFileSync(
        path.join(workspace, ".qmd", "last-operation.json"),
        "utf8",
      ),
    ).status,
    "succeeded",
  );
});

test("failed and timed out QMD refreshes release the lock and remain retryable", async () => {
  const { workspace, bin, env } = await qmdFixture();
  for (const behavior of [
    "process.exit(7);",
    'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);',
  ]) {
    writeNodeExecutable(
      bin,
      "qmd",
      `if (process.argv.includes("--version")) console.log("qmd 2.5.3"); else { ${behavior} }`,
    );
    const result = await runCli(
      ["qmd", "refresh", workspace, "--timeout-seconds", "1"],
      { env },
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(
      fs.existsSync(path.join(workspace, ".qmd", "operation.lock")),
      false,
    );
    assert.equal(
      parseJsonObject(
        fs.readFileSync(
          path.join(workspace, ".qmd", "last-operation.json"),
          "utf8",
        ),
      ).status,
      "failed",
    );
  }
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");',
  );
  assert.equal(
    (await runCli(["qmd", "refresh", workspace], { env })).status,
    0,
  );
  for (const timeout of ["0", "3601", "1.5"]) {
    assert.equal(
      (
        await runCli(
          ["qmd", "refresh", workspace, "--timeout-seconds", timeout],
          { env },
        )
      ).status,
      2,
    );
  }
});

test("QMD cleanup does not remove a replacement lock owned by another operation", async () => {
  const { workspace } = await qmdFixture();
  const lock = path.join(workspace, ".qmd", "operation.lock");
  const replacement = path.join(workspace, ".qmd", "replacement-lock");
  fs.writeFileSync(replacement, "another owner\n");
  const closeSync = fs.closeSync;
  const close = vi.spyOn(fs, "closeSync");
  try {
    await assert.rejects(
      withQmdLock(workspace, "refresh", () => {
        // Windows cannot replace an open file. Inject the race after the real
        // close, before cleanup checks ownership, so every platform tests it.
        close.mockImplementationOnce((descriptor) => {
          closeSync(descriptor);
          fs.renameSync(replacement, lock);
        });
        return Promise.resolve();
      }),
      /refusing to remove another owner's lock/,
    );
  } finally {
    close.mockRestore();
  }
  assert.equal(fs.readFileSync(lock, "utf8"), "another owner\n");
  assert.equal(
    fs.existsSync(path.join(workspace, ".qmd", "last-operation.json")),
    false,
  );
});

test("bounded QMD processes kill launcher descendants and cap captured output", async () => {
  const root = temporaryDirectory();
  const started = path.join(root, "started");
  const escaped = path.join(root, "escaped");
  const grandchild = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(escaped)}, "unsafe"), 800);`;
  const launcher = `require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(grandchild)}], { stdio: "inherit" }); require("node:fs").writeFileSync(${JSON.stringify(started)}, "started"); setInterval(() => {}, 1000);`;
  await assert.rejects(
    runBounded(process.execPath, ["-e", launcher], { timeoutMs: 400 }),
    /timed out/,
  );
  assert.ok(fs.existsSync(started));
  await new Promise((resolve) => {
    setTimeout(resolve, 850);
  });
  assert.equal(fs.existsSync(escaped), false);
  await assert.rejects(
    runBounded(
      process.execPath,
      [
        "-e",
        'process.stdout.write("x".repeat(1_100_000)); setInterval(() => {}, 1000);',
      ],
      { timeoutMs: 2000 },
    ),
    /output exceeded/,
  );
  await assert.rejects(
    runBounded(path.join(root, "missing-executable"), [], { timeoutMs: 1000 }),
    /ENOENT/,
  );
});

async function qmdFixture(): Promise<{
  workspace: string;
  bin: string;
  env: NodeJS.ProcessEnv;
}> {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Fixture"])).status,
    0,
  );
  fs.mkdirSync(path.join(workspace, ".qmd"));
  fs.writeFileSync(
    path.join(workspace, ".qmd", "index.yml"),
    "collections: {}\n",
  );
  writeNodeExecutable(
    bin,
    "qmd",
    'if (process.argv.includes("--version")) console.log("qmd 2.5.3");',
  );
  return {
    workspace,
    bin,
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` },
  };
}
