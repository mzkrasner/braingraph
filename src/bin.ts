import { main } from "./cli.js";

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`braingraph: ${message}\n`);
  process.exitCode = 1;
}
