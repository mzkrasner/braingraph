import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isIsoDate, lintKnowledge } from "../src/knowledge-lint.js";
import { loadWorkspace } from "../src/manifest.js";
import { obsidianConfigChecks } from "../src/obsidian-config.js";

import { runCli, temporaryDirectory } from "./helpers.js";

let root: string;
let vault: string;

beforeEach(async () => {
  root = temporaryDirectory();
  expect(
    (await runCli(["init", root, "--name", "Fictional Research"])).status,
  ).toBe(0);
  vault = path.join(root, "Knowledge");
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function note(name: string, text: string): void {
  const file = path.join(vault, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function findings(): ReturnType<typeof lintKnowledge>["findings"] {
  return lintKnowledge(loadWorkspace(root)).findings;
}

describe("knowledge lint", () => {
  it("accepts scaffold and leaves source files unchanged", async () => {
    const before = fs.readFileSync(path.join(vault, "Start Here.md"), "utf8");
    const result = await runCli(["knowledge", "lint", root, "--json"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"filesChecked"');
    expect(fs.readFileSync(path.join(vault, "Start Here.md"), "utf8")).toBe(
      before,
    );
    expect((await runCli(["knowledge", "lint", "--help"])).stdout).toContain(
      "does not verify facts",
    );
    expect((await runCli(["knowledge", "lint", root, root])).status).toBe(2);
  });

  it.each([
    ["created: 2026-02-30", "metadata-date"],
    ["created: yesterday", "metadata-date"],
    ["created: 2026-01-01\ncreated: 2026-01-02", "frontmatter"],
    ["- list", "frontmatter"],
    ["value: !unknown hello", "frontmatter"],
    ["one: &one hello\ntwo: *one", "frontmatter"],
    ["evidence_status: verified", "metadata-enum"],
    ["verification_limits: []", "metadata-text"],
    ["type: decision\nstatus: done", "metadata-enum"],
  ])("reports invalid metadata %s", (metadata, rule) => {
    note("wiki/Invalid.md", `---\n${metadata}\n---\n# Invalid\n`);
    expect(findings()).toContainEqual(
      expect.objectContaining({
        file: "wiki/Invalid.md",
        rule,
        status: "error",
      }),
    );
  });

  it("supports block scalars, quoted dates, tags and optional metadata", () => {
    note(
      "wiki/Valid.md",
      '---\ncreated: "2026-01-01"\nevidence_status: mixed\nverification_scope: >\n  A fictional source was inspected.\nverification_limits: |\n  Other claims remain unverified.\ntags: [test, example]\n---\n# Valid\n',
    );
    expect(findings().filter((item) => item.file === "wiki/Valid.md")).toEqual(
      [],
    );
  });

  it("accepts an empty Obsidian properties block", () => {
    note("wiki/Empty.md", "---\n---\n# Empty properties\n");
    expect(findings().filter((item) => item.file === "wiki/Empty.md")).toEqual(
      [],
    );
  });

  it("reports missing contract-2 artifacts without imposing them on legacy brains", async () => {
    fs.unlinkSync(path.join(vault, "_templates", "Decision.md"));
    const modern = await runCli(["doctor", root, "--json"], {
      env: { PATH: "" },
    });
    expect(modern.status).toBe(1);
    expect(modern.stdout).toContain("contract-2:");
    const manifestFile = path.join(root, "braingraph.json");
    const workspace = loadWorkspace(root);
    workspace.manifest.templateVersion = 1;
    fs.writeFileSync(manifestFile, JSON.stringify(workspace.manifest));
    const legacy = await runCli(["doctor", root, "--json"], {
      env: { PATH: "" },
    });
    expect(legacy.status).toBe(0);
    expect(legacy.stdout).toContain("older than current 2");
  });

  it("does not mistake reading or approval for live verification or implementation", () => {
    note(
      "wiki/Decision.md",
      "---\ntype: decision\nstatus: implemented\nlast_verified: 2026-01-01\n---\n# Decision\n",
    );
    const issues = findings();
    expect(
      issues
        .filter((item) => item.rule === "decision-evidence")
        .map((item) => item.detail)
        .join("\n"),
    ).toContain("accepted_at");
    expect(
      issues
        .filter((item) => item.rule === "decision-evidence")
        .map((item) => item.detail)
        .join("\n"),
    ).toContain("implemented_at");
    expect(issues.some((item) => item.rule === "verification-scope")).toBe(
      true,
    );
    note(
      "wiki/Decision.md",
      "---\ntype: decision\nstatus: accepted\naccepted_at: 2026-01-01\nproposed_at: 2026-01-02\n---\n# Decision\n",
    );
    expect(findings()).toContainEqual(
      expect.objectContaining({ rule: "decision-order" }),
    );
  });

  it("catches malformed delimiters and oversized notes while skipping raw templates and eval cases", () => {
    note("wiki/Bad.md", "---\ncreated: 2026-01-01\n---not-a-delimiter\n");
    note("wiki/Huge.md", "x".repeat(2 * 1024 * 1024 + 1));
    note("raw/Untrusted.md", "---\nbroken: [\n");
    note("evals/Broken.md", "---\nbroken: [\n");
    expect(findings()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "frontmatter", file: "wiki/Bad.md" }),
        expect.objectContaining({ rule: "note-size", file: "wiki/Huge.md" }),
      ]),
    );
    expect(
      findings().some(
        (item) =>
          item.file.startsWith("raw/") || item.file.startsWith("evals/"),
      ),
    ).toBe(false);
  });

  it("does not invent time or timezone while checking decision order", () => {
    note(
      "wiki/Decision.md",
      "---\ntype: decision\nstatus: accepted\nproposed_at: 2026-01-01T18:00:00Z\naccepted_at: 2026-01-01\n---\n",
    );
    expect(
      findings().filter((item) => item.file === "wiki/Decision.md"),
    ).toEqual([]);
    note(
      "wiki/Decision.md",
      "---\ntype: decision\nstatus: implemented\naccepted_at: 2026-01-01T18:00:00\nimplemented_at: 2026-01-01T17:00:00Z\n---\n",
    );
    expect(
      findings().filter((item) => item.file === "wiki/Decision.md"),
    ).toEqual([]);
  });

  it("does not validate or resolve links through Obsidian trash", () => {
    note(".trash/Deleted.md", "---\ncreated: not-a-date\n---\n");
    note("wiki/Links.md", "[[Deleted]]\n");
    expect(
      findings().filter((item) => item.file.startsWith(".trash/")),
    ).toEqual([]);
    expect(findings()).toContainEqual(
      expect.objectContaining({
        file: "wiki/Links.md",
        detail: "unresolved wikilink: Deleted",
      }),
    );
  });

  it("validates vault-relative source paths without requiring retained raw copies", () => {
    note("raw/Source.md", "# Fictional source\n");
    note(
      "wiki/Source.md",
      "---\nsource_path: raw/Source.md\nsource_paths: [raw/Source.md]\n---\n# Source\n",
    );
    expect(findings().filter((item) => item.rule === "source-path")).toEqual(
      [],
    );
    note(
      "wiki/Source.md",
      "---\nsource_path: ../other-brain/secret.md\nsource_paths: invalid\n---\n",
    );
    expect(
      findings().filter((item) => item.rule === "source-path"),
    ).toHaveLength(2);
    note(
      "wiki/Source.md",
      "---\nsource_paths: [missing.md, raw, 'https://example.invalid/page']\n---\n",
    );
    expect(
      findings().filter((item) => item.rule === "source-path"),
    ).toHaveLength(3);
  });

  it("detects missing and ambiguous wikilinks but ignores code, aliases and anchors", () => {
    note("wiki/Topic.md", "# Topic\n");
    note("domains/Topic.md", "# Another topic\n");
    note(
      "projects/Links.md",
      "[[Topic]] [[Missing]] [[wiki/Topic#Topic|topic]] [[#Local]] `[[Code]]`\n```md\n[[Fence]]\n```\n~~~\n[[Tilde]]\n~~~\n",
    );
    const issues = findings().filter(
      (item) => item.file === "projects/Links.md",
    );
    expect(issues).toHaveLength(2);
    expect(issues.map((item) => item.detail).join("\n")).toContain("ambiguous");
    note("wiki/Escape.md", "[[../../another-brain/Topic]]\n");
    expect(findings()).toContainEqual(
      expect.objectContaining({ file: "wiki/Escape.md", status: "error" }),
    );
  });

  it.skipIf(process.platform === "win32")(
    "does not follow symlinks into another brain",
    async () => {
      const second = path.join(root, "other");
      expect(
        (await runCli(["init", second, "--name", "Other Fictional Brain"]))
          .status,
      ).toBe(0);
      fs.symlinkSync(
        path.join(second, "Knowledge"),
        path.join(vault, "wiki", "Other"),
      );
      expect(findings()).toContainEqual(
        expect.objectContaining({ rule: "filesystem-link", status: "error" }),
      );
    },
  );

  it("scopes lint to the chosen brain even from another workspace", async () => {
    const second = path.join(root, "second");
    expect(
      (await runCli(["init", second, "--name", "Second Fictional Brain"]))
        .status,
    ).toBe(0);
    note("wiki/Bad.md", "---\ncreated: yesterday\n---\n");
    expect(
      (await runCli(["knowledge", "lint", second], { cwd: root })).status,
    ).toBe(0);
    expect(
      (await runCli(["knowledge", "lint", root], { cwd: second })).status,
    ).toBe(1);
  });
});

describe("date and Obsidian configuration contracts", () => {
  it.each([
    "2024-02-29",
    "2026-01-01T10:20:30Z",
    "2026-01-01T10:20:30.123-04:00",
    "2026-01-01T10:00:00",
  ])("accepts %s", (value) => {
    expect(isIsoDate(value)).toBe(true);
  });
  it.each([
    null,
    "2025-02-29",
    "2026-13-01",
    "2026-01-01T25:00:00Z",
    "2026-01-01T24:00:00Z",
  ])("rejects invalid %s", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });

  it("accepts Obsidian plugin arrays and boolean maps", () => {
    expect(
      obsidianConfigChecks(vault).every((item) => item.status === "ok"),
    ).toBe(true);
    fs.writeFileSync(
      path.join(vault, ".obsidian", "core-plugins.json"),
      JSON.stringify({ templates: true, backlinks: true }),
    );
    expect(
      obsidianConfigChecks(vault).every((item) => item.status === "ok"),
    ).toBe(true);
  });

  it.each([[], { templates: false }, { templates: "true" }, [1], null])(
    "rejects invalid plugin configuration %j",
    (plugins) => {
      fs.writeFileSync(
        path.join(vault, ".obsidian", "core-plugins.json"),
        JSON.stringify(plugins),
      );
      expect(obsidianConfigChecks(vault)).toContainEqual(
        expect.objectContaining({
          name: "obsidian:config:core-plugins.json",
          status: "error",
        }),
      );
    },
  );

  it("validates template location and intake settings semantically", () => {
    fs.writeFileSync(
      path.join(vault, ".obsidian", "templates.json"),
      '{"folder":"../outside"}',
    );
    fs.writeFileSync(
      path.join(vault, ".obsidian", "app.json"),
      '{"alwaysUpdateLinks":"true"}',
    );
    expect(
      obsidianConfigChecks(vault).filter((item) => item.status === "error"),
    ).toHaveLength(2);
    fs.writeFileSync(
      path.join(vault, ".obsidian", "app.json"),
      '{"alwaysUpdateLinks":true,"newFileLocation":"root"}',
    );
    expect(obsidianConfigChecks(vault)[0]?.status).toBe("error");
    fs.writeFileSync(
      path.join(vault, ".obsidian", "templates.json"),
      '{"folder":1}',
    );
    expect(obsidianConfigChecks(vault)[1]?.status).toBe("error");
    fs.writeFileSync(
      path.join(vault, ".obsidian", "templates.json"),
      '{"folder":"index.md"}',
    );
    expect(obsidianConfigChecks(vault)[1]?.status).toBe("error");
  });
});
