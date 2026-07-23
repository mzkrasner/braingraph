import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "vitest";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const setupSkillRoot = path.join(
  repositoryRoot,
  ".agents",
  "skills",
  "setup-braingraph",
);

test("setup requires an operational-root discovery assessment", () => {
  const skill = fs.readFileSync(path.join(setupSkillRoot, "SKILL.md"), "utf8");
  const topology = fs.readFileSync(
    path.join(setupSkillRoot, "references", "workspace-topology.md"),
    "utf8",
  );

  assert.match(skill, /references\/workspace-topology\.md/);
  assert.match(skill, /operational roots and representative directories/);
  assert.match(skill, /discovery matrix/);
  assert.match(skill, /fresh-agent or equivalent read-only check/);
  assert.match(
    skill,
    /Do not assume that registering or bridging one checkout covers sibling Git worktrees/,
  );

  assert.match(topology, /Operational root/);
  assert.match(topology, /git worktree list --porcelain/);
  assert.match(
    topology,
    /A `repo attach` bridge applies only to the exact checkout where it is created/,
  );
  assert.match(topology, /## Required Proposal/);
  assert.match(topology, /## Acceptance Check/);
  assert.match(
    topology,
    /must not depend on prior conversation context, remembered absolute paths, or an unrelated global instruction/,
  );
});
