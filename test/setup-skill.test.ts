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

test("existing workspace adoption stays agent-led and proportional", () => {
  const skill = fs.readFileSync(path.join(setupSkillRoot, "SKILL.md"), "utf8");
  const adoption = fs.readFileSync(
    path.join(setupSkillRoot, "references", "existing-workspace-adoption.md"),
    "utf8",
  );
  const repositoryGuide = fs.readFileSync(
    path.join(repositoryRoot, "AGENTS.md"),
    "utf8",
  );

  assert.match(skill, /references\/existing-workspace-adoption\.md/);
  assert.match(skill, /two approval boundaries/i);
  assert.match(skill, /custom migration program/i);
  assert.match(skill, /freeze of\s+unrelated repositories/i);
  assert.match(skill, /ungoverned scratch directory/i);

  assert.match(adoption, /## State Classes/);
  assert.match(adoption, /Canonical durable state/);
  assert.match(adoption, /Reversible local state/);
  assert.match(adoption, /Disposable derived state/);
  assert.match(adoption, /Unrelated state/);
  assert.match(adoption, /Rebuild disposable Obsidian\/QMD state/i);
  assert.match(adoption, /Two human approval boundaries are normally enough/i);
  assert.match(adoption, /Do not freeze unrelated Git repositories/i);

  assert.match(repositoryGuide, /reusable Braingraph commands and tests/i);
  assert.match(repositoryGuide, /do not replace judgment with/i);
  assert.match(repositoryGuide, /one-off migration program/i);
});
