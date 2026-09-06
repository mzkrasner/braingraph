import { booleanOption, parseArgs, rejectUnknownOptions } from "../args.js";
import { UsageError } from "../errors.js";
import { lintKnowledge } from "../knowledge-lint.js";
import { loadWorkspace } from "../manifest.js";
import type { CommandContext } from "../types.js";

export const KNOWLEDGE_HELP = `Usage:
  braingraph knowledge lint [directory] [--json]

Read-only note checks: YAML, declared dates/provenance, decision lifecycle,
local source paths, and wikilinks. Skips raw intake, templates, and eval fixtures.
Errors exit 1; warnings need review. This does not verify facts or agent behavior.`;

/** Reports deterministic note-quality findings within one selected brain. */
export function knowledgeLintCommand(
  tokens: readonly string[],
  context: CommandContext = {},
): number {
  const { positionals, options } = parseArgs(tokens);
  rejectUnknownOptions(options, ["json", "help"]);
  const output = context.output ?? process.stdout;
  if (booleanOption(options, "help")) {
    output.write(`${KNOWLEDGE_HELP}\n`);
    return 0;
  }
  if (positionals.length > 1)
    throw new UsageError("knowledge lint accepts at most one directory");
  const result = lintKnowledge(loadWorkspace(positionals[0] ?? process.cwd()));
  if (booleanOption(options, "json"))
    output.write(`${JSON.stringify(result, null, 2)}\n`);
  else {
    output.write(
      `Knowledge lint: ${result.workspace} (${String(result.filesChecked)} notes)\n`,
    );
    for (const entry of result.findings)
      output.write(
        `  [${entry.status}] ${entry.file}: ${entry.rule}: ${entry.detail}\n`,
      );
    output.write(
      "Structural checks only; authoritative verification and agent evaluations remain separate.\n",
    );
  }
  return result.ok ? 0 : 1;
}
