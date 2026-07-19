import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import { runCli, temporaryDirectory } from "./helpers.js";

test("QMD configuration dry run uses the declared vault, collection, and mask", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const fakeQmd = path.join(bin, "qmd");
  fs.writeFileSync(
    fakeQmd,
    '#!/usr/bin/env node\nif (process.argv.includes("show")) process.exit(1);\n',
    { encoding: "utf8", mode: 0o755 },
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

test("QMD configuration refuses to reuse a conflicting collection", async () => {
  const root = temporaryDirectory();
  const workspace = path.join(root, "workspace");
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "qmd"),
    '#!/usr/bin/env node\nif (process.argv.includes("show")) { console.log("Collection: conflict\\n  Path: /different\\n  Pattern: **/*.md"); process.exit(0); }\n',
    { encoding: "utf8", mode: 0o755 },
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
  fs.mkdirSync(bin);
  assert.equal(
    (await runCli(["init", workspace, "--name", "QMD Example"])).status,
    0,
  );
  const vault = path.join(workspace, "Knowledge");
  fs.writeFileSync(
    path.join(bin, "qmd"),
    `#!/bin/sh\nprintf 'Path: %s\\nPattern: %s\\n' '${vault}' '{projects/**/*.md,domains/**/*.md,wiki/**/*.md,reports/**/*.md}'\n`,
    { encoding: "utf8", mode: 0o755 },
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
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "qmd"), "#!/bin/sh\nexit 0\n", {
    encoding: "utf8",
    mode: 0o755,
  });
  assert.equal(
    (await runCli(["init", workspace, "--name", "Refresh Example"])).status,
    0,
  );

  const result = await runCli(
    ["qmd", "refresh", workspace, "--dry-run", "--embed"],
    { env: { PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}` } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /qmd update/);
  assert.match(result.stdout, /qmd embed -c refresh-example-brain/);
});
