import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import { test } from "vitest";

import { createManifest, validateManifest } from "../src/manifest.js";
import type { ExternalSystem } from "../src/types.js";

import { parseJsonObject, repositoryRoot } from "./helpers.js";

const schema = parseJsonObject(
  fs.readFileSync(
    path.join(repositoryRoot, "schemas", "workspace.schema.json"),
    "utf8",
  ),
);
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(
  schema,
);

function validManifest(): ReturnType<typeof createManifest> {
  return createManifest({
    name: "Schema Fixture",
    slug: "schema-fixture",
    description: "Synthetic manifest used to verify both validators.",
    scope: "project",
    sensitivity: "private",
    maintenanceMode: "proposal-first",
    knowledgeDirectory: "Knowledge",
    profiles: ["knowledge", "software"],
  });
}

function assertRejectedByBoth(candidate: unknown): void {
  assert.equal(
    validateSchema(candidate),
    false,
    "JSON Schema unexpectedly accepted fixture",
  );
  assert.notDeepEqual(
    validateManifest(candidate),
    [],
    "runtime validator unexpectedly accepted fixture",
  );
}

test("generated manifests satisfy runtime and Draft 2020-12 validators", () => {
  const manifest = validManifest();
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(
    validateSchema(manifest),
    true,
    JSON.stringify(validateSchema.errors),
  );
});

test("runtime and JSON Schema reject the same critical boundary violations", () => {
  const emptyInclude = structuredClone(validManifest());
  emptyInclude.knowledge.qmd.include = [];
  assertRejectedByBoth(emptyInclude);

  const rootKnowledge = structuredClone(validManifest());
  rootKnowledge.knowledge.directory = ".";
  assertRejectedByBoth(rootKnowledge);

  const invalidRepositoryKey = structuredClone(validManifest());
  Reflect.set(invalidRepositoryKey.repositories, "Bad Key", {
    mode: "managed",
    url: "https://example.invalid/repository.git",
    path: "repositories/bad-key",
    integrationBranch: "main",
    productionBranch: null,
    stableWorktree: "main",
    branchPrefix: "work/",
  });
  assertRejectedByBoth(invalidRepositoryKey);

  const missingProductionBranch = structuredClone(validManifest());
  Reflect.set(missingProductionBranch.repositories, "app", {
    mode: "attached",
    url: "https://example.invalid/repository.git",
    path: "repositories/app",
    integrationBranch: "main",
  });
  assertRejectedByBoth(missingProductionBranch);
});

test("schema documents runtime-only external identifier uniqueness", () => {
  assert.match(
    JSON.stringify(schema),
    /External-system id uniqueness is enforced by the runtime validator/,
  );
});

test("both validators accept additive identity constraints and reject malformed bindings", () => {
  const system: ExternalSystem = {
    id: "mail",
    name: "Mail",
    status: "active",
    roles: ["source"],
    owns: ["correspondence"],
    identifiers: ["message ID"],
    access: { read: "connector", write: "prohibited" },
    freshness: "verify-live",
    capture: "summarize",
    sensitivity: "private",
    fallback: "Stop on an unresolved account.",
  };
  for (const identity of [
    undefined,
    { account: "research@example.invalid" },
    { tenant: "tenant-a", principal: "user-a" },
  ]) {
    const candidate = validManifest();
    candidate.externalSystems = [
      { ...system, ...(identity === undefined ? {} : { identity }) },
    ];
    assert.deepEqual(validateManifest(candidate), []);
    assert.equal(
      validateSchema(candidate),
      true,
      JSON.stringify(validateSchema.errors),
    );
  }
  for (const identity of [
    {},
    [],
    null,
    { account: "" },
    { tenant: " " },
    { principal: " leading-space" },
    { account: "trailing-space " },
    { account: "one\ntwo" },
    { account: "control\u0000character" },
    { token: "not-a-real-credential" },
    { account: 1 },
  ]) {
    const candidate = validManifest();
    candidate.externalSystems = [{ ...system }];
    assert.ok(candidate.externalSystems[0]);
    Reflect.set(candidate.externalSystems[0], "identity", identity);
    assertRejectedByBoth(candidate);
  }
});
