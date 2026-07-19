import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
const unresolvedTemplateMarker = ["[TODO", ":"].join("");
const machineSpecificPathPatterns = [
  /\/Users\/[^/\s"']+\//,
  /\/home\/[^/\s"']+\//,
  /[A-Za-z]:\\Users\\[^\\\s"']+\\/,
];
const claudeAdapters = [
  "CLAUDE.md",
  "templates/core/CLAUDE.md",
  "templates/core/Knowledge/CLAUDE.md",
  "templates/software/repository-CLAUDE.md",
];

for (const file of filesUnder(root)) {
  const relative = path.relative(root, file);
  if (/\.(?:md|ts|mjs|json|ya?ml)$/.test(file)) {
    const content = fs.readFileSync(file, "utf8");
    if (machineSpecificPathPatterns.some((pattern) => pattern.test(content))) {
      failures.push(
        `${relative}: contains a machine-specific absolute home path`,
      );
    }
    if (content.includes(unresolvedTemplateMarker))
      failures.push(`${relative}: contains an unresolved TODO template`);
  }
}

for (const relative of claudeAdapters) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: missing Claude instruction adapter`);
    continue;
  }
  if (
    fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") !== "@AGENTS.md\n"
  ) {
    failures.push(`${relative}: must contain only @AGENTS.md`);
  }
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Portability checks passed.\n");
}

function filesUnder(directory: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      [".git", ".braingraph-tmp", "coverage", "dist", "node_modules"].includes(
        entry.name,
      )
    )
      continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...filesUnder(absolute));
    else if (entry.isFile()) results.push(absolute);
  }
  return results;
}
