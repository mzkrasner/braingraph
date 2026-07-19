import assert from "node:assert/strict";

import { test } from "vitest";

import {
  booleanOption,
  listOption,
  parseArgs,
  rejectUnknownOptions,
  stringOption,
} from "../src/args.js";
import { createManifest, validateManifest } from "../src/manifest.js";
import { commandExists, displayCommand, run } from "../src/process.js";
import {
  assertRelativePath,
  assertSlug,
  resolveInside,
  sameJson,
  slugify,
  unique,
} from "../src/util.js";

test("argument parsing supports inline, repeated, boolean, and negated options", () => {
  const parsed = parseArgs([
    "case",
    "--name=Example",
    "--role",
    "source",
    "--role=execution",
    "--no-embed",
    "--dry-run",
  ]);

  assert.deepEqual(parsed.positionals, ["case"]);
  assert.equal(stringOption(parsed.options, "name"), "Example");
  assert.deepEqual(listOption(parsed.options, "role"), ["source", "execution"]);
  assert.equal(booleanOption(parsed.options, "embed", true), false);
  assert.equal(booleanOption(parsed.options, "dry-run"), true);
  rejectUnknownOptions(parsed.options, ["name", "role", "embed", "dry-run"]);
});

test("argument parsing rejects invalid option shapes", () => {
  assert.throws(() => parseArgs(["--name"]), /requires a value/);
  assert.throws(() => parseArgs(["--no-name"]), /unknown negated option/);
  const parsed = parseArgs(["--dry-run"]);
  assert.throws(
    () => stringOption(parsed.options, "dry-run"),
    /requires a value/,
  );
  assert.throws(() => {
    rejectUnknownOptions(parsed.options, ["help"]);
  }, /unknown option/);
});

test("manifest validation reports malformed workspace boundaries", () => {
  assert.deepEqual(validateManifest(null), ["root must be an object"]);
  const invalid: unknown = {
    schemaVersion: 2,
    workspace: { name: "", slug: "Bad Slug", profiles: ["other"] },
    knowledge: {
      directory: "../outside",
      obsidian: { enabled: false },
      qmd: { enabled: false, collection: "", include: [] },
    },
    externalSystems: [null],
    repositories: { Bad: null },
  };
  const errors = validateManifest(invalid);
  assert.ok(errors.some((error) => error.includes("schemaVersion")));
  assert.ok(errors.some((error) => error.includes("workspace.name")));
  assert.ok(errors.some((error) => error.includes("workspace.slug")));
  assert.ok(errors.some((error) => error.includes("knowledge.directory")));
  assert.ok(errors.some((error) => error.includes("externalSystems entries")));
  assert.ok(errors.some((error) => error.includes("repository Bad")));
});

test("a generated manifest satisfies its own runtime validator", () => {
  const manifest = createManifest({
    name: "Example",
    slug: "example",
    knowledgeDirectory: "Knowledge",
    profiles: ["knowledge", "software"],
  });
  assert.deepEqual(validateManifest(manifest), []);
});

test("manifest validation detects duplicate and invalid external-system contracts", () => {
  const manifest = createManifest({
    name: "Example",
    slug: "example",
    knowledgeDirectory: "Knowledge",
    profiles: ["knowledge"],
  });
  const invalidSystem = {
    id: "source-system",
    name: "",
    roles: [],
    owns: [],
    access: { read: "invalid", write: "invalid" },
    freshness: "invalid",
    capture: "invalid",
    sensitivity: "invalid",
  };
  const candidate = {
    ...manifest,
    externalSystems: [invalidSystem, invalidSystem],
  };
  const errors = validateManifest(candidate);
  assert.ok(
    errors.some((error) => error.includes("duplicate external system")),
  );
  assert.ok(errors.some((error) => error.includes("requires a name")));
  assert.ok(errors.some((error) => error.includes("invalid read access")));
  assert.ok(errors.some((error) => error.includes("invalid sensitivity")));
});

test("path and identifier utilities enforce portable workspace values", () => {
  assert.equal(slugify("Example Workspace"), "example-workspace");
  assert.equal(assertSlug("example-1"), "example-1");
  assert.throws(() => assertSlug("Example"), /lowercase letters/);
  assert.throws(() => slugify("---"), /cannot derive a slug/);
  assert.equal(assertRelativePath("docs/notes"), "docs/notes");
  assert.throws(() => assertRelativePath("../outside"), /remain inside/);
  assert.throws(() => assertRelativePath("/outside"), /relative path/);
  assert.match(resolveInside("/tmp/workspace", "docs"), /workspace\/docs$/);
  assert.deepEqual(unique(["a", "b", "a"]), ["a", "b"]);
  assert.equal(sameJson({ a: 1 }, { a: 1 }), true);
  assert.equal(sameJson({ a: 1 }, { a: 2 }), false);
});

test("subprocess helpers report failures and quote review output", () => {
  const allowed = run(process.execPath, ["-e", "process.exit(7)"], {
    allowFailure: true,
  });
  assert.equal(allowed.status, 7);
  assert.throws(
    () =>
      run(process.execPath, [
        "-e",
        "process.stderr.write('failed'); process.exit(2)",
      ]),
    /failed/,
  );
  assert.throws(
    () => run(process.execPath, ["-e", "process.exit(2)"]),
    /failed$/,
  );
  assert.throws(() => run("braingraph-command-that-does-not-exist", []));
  const captured = run(
    process.execPath,
    ["-e", "process.stdout.write(process.env.BRAINGRAPH_TEST_VALUE ?? '')"],
    {
      cwd: process.cwd(),
      env: { ...process.env, BRAINGRAPH_TEST_VALUE: "captured" },
      stdio: "pipe",
    },
  );
  assert.equal(captured.stdout, "captured");
  assert.equal(commandExists(process.execPath), true);
  assert.equal(
    commandExists("braingraph-command-that-does-not-exist", "win32"),
    false,
  );
  assert.equal(
    displayCommand("example", ["plain", "two words"]),
    'example plain "two words"',
  );
});
