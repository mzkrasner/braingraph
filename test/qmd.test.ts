import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

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
  const canonicalWorkspace = fs.realpathSync(workspace);
  assert.ok(
    calls.every(
      (call) =>
        typeof call.cwd === "string" &&
        fs.realpathSync(call.cwd) === canonicalWorkspace,
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
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
if (args[0] === "--version") {
  console.log("qmd 2.5.3");
} else if (args[0] === "init") {
  fs.mkdirSync(path.join(process.cwd(), ".qmd"), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), ".qmd", "index.yml"), "version: 1\\n");
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
