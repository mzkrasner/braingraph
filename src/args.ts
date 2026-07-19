import { UsageError } from "./errors.js";
import type {
  OptionMap,
  OptionScalar,
  OptionValue,
  ParsedArguments,
} from "./types.js";

const BOOLEAN_OPTIONS = new Set([
  "bridge",
  "clone",
  "configure",
  "dry-run",
  "embed",
  "execute",
  "fetch",
  "help",
  "install-tools",
  "json",
]);

/** Parses positional arguments and GNU-style long options. */
export function parseArgs(tokens: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  const options: OptionMap = new Map();
  const pending = [...tokens];

  while (pending.length > 0) {
    const argument = pending.shift();
    if (argument === undefined) {
      break;
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
    } else {
      parseLongOption(argument, pending, options);
    }
  }

  return { positionals, options };
}

function parseLongOption(
  token: string,
  pending: string[],
  options: OptionMap,
): void {
  const equalsIndex = token.indexOf("=");
  const rawKey = token.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
  const inlineValue =
    equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);

  if (rawKey.startsWith("no-")) {
    if (inlineValue !== undefined) {
      throw new UsageError(`--${rawKey} does not accept a value`);
    }
    addNegatedOption(rawKey, options);
    return;
  }
  if (BOOLEAN_OPTIONS.has(rawKey)) {
    addBooleanOption(rawKey, inlineValue, options);
    return;
  }
  addOption(options, rawKey, inlineValue ?? takeOptionValue(rawKey, pending));
}

function addBooleanOption(
  key: string,
  inlineValue: string | undefined,
  options: OptionMap,
): void {
  if (inlineValue === undefined || inlineValue === "true") {
    addOption(options, key, true);
    return;
  }
  if (inlineValue === "false") {
    addOption(options, key, false);
    return;
  }
  throw new UsageError(`--${key} accepts only true or false`);
}

function addNegatedOption(rawKey: string, options: OptionMap): void {
  const key = rawKey.slice(3);
  if (!BOOLEAN_OPTIONS.has(key)) {
    throw new UsageError(`unknown negated option: --${rawKey}`);
  }
  addOption(options, key, false);
}

function takeOptionValue(key: string, pending: string[]): string {
  const value = pending.shift();
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`--${key} requires a value`);
  }
  return value;
}

function addOption(options: OptionMap, key: string, value: OptionScalar): void {
  const existing = options.get(key);
  if (existing === undefined) {
    options.set(key, value);
    return;
  }
  options.set(
    key,
    Array.isArray(existing) ? [...existing, value] : [existing, value],
  );
}

function option(options: OptionMap, key: string): OptionValue | undefined;
function option(
  options: OptionMap,
  key: string,
  fallback: OptionValue,
): OptionValue;
function option(
  options: OptionMap,
  key: string,
  fallback?: OptionValue,
): OptionValue | undefined {
  return options.get(key) ?? fallback;
}

/** Returns the last string value for an option. */
export function stringOption(
  options: OptionMap,
  key: string,
): string | undefined;
export function stringOption(
  options: OptionMap,
  key: string,
  fallback: string,
): string;
/** Resolves a string option with its optional fallback. */
export function stringOption(
  options: OptionMap,
  key: string,
  fallback?: string,
): string | undefined {
  const value =
    fallback === undefined
      ? option(options, key)
      : option(options, key, fallback);
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return String(value.at(-1));
  if (typeof value === "boolean") {
    throw new UsageError(`--${key} requires a value`);
  }
  return value;
}

/** Returns the effective boolean value for an option. */
export function booleanOption(
  options: OptionMap,
  key: string,
  fallback = false,
): boolean {
  const value = option(options, key, fallback);
  if (Array.isArray(value)) return Boolean(value.at(-1));
  return Boolean(value);
}

/** Returns repeated and comma-separated option values as a flat list. */
export function listOption(
  options: OptionMap,
  key: string,
  fallback: readonly string[] = [],
): string[] {
  const value = option(options, key);
  if (value === undefined) return [...fallback];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Rejects option keys not declared by the current command. */
export function rejectUnknownOptions(
  options: OptionMap,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of options.keys()) {
    if (!allowedSet.has(key)) throw new UsageError(`unknown option: --${key}`);
  }
}
