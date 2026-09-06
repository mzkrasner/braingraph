import type { ExternalSystemIdentity } from "./types.js";

export const IDENTITY_FIELDS = ["account", "tenant", "principal"] as const;

/** Validates non-secret identity metadata without interpreting provider IDs. */
export function validateSystemIdentity(
  value: unknown,
  label: string,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [`${label} must be an object`];
  }
  const identity = value as Record<string, unknown>;
  const errors: string[] = [];
  if (Object.keys(identity).length === 0) {
    errors.push(`${label} requires at least one account, tenant, or principal`);
  }
  for (const [key, identifier] of Object.entries(identity)) {
    if (!IDENTITY_FIELDS.some((field) => field === key)) {
      errors.push(`${label} contains unsupported field: ${key}`);
    } else if (!isIdentityString(identifier)) {
      errors.push(
        `${label}.${key} must be a non-empty, trimmed, single-line identifier`,
      );
    }
  }
  return errors;
}

/** Matches every declared constraint exactly; omission never acts as a wildcard. */
export function identityMismatches(
  expected: ExternalSystemIdentity,
  observed: ExternalSystemIdentity,
): string[] {
  const comparisons = [
    ["account", expected.account, observed.account],
    ["tenant", expected.tenant, observed.tenant],
    ["principal", expected.principal, observed.principal],
  ] as const;
  return comparisons.flatMap(([field, constraint, actual]) => {
    if (constraint === undefined) return [];
    if (actual === undefined) return [`${field} is unresolved`];
    return constraint === actual ? [] : [`${field} does not match`];
  });
}

/** Identifiers remain opaque and case-sensitive; callers must supply canonical values. */
export function isIdentityString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim() === value &&
    !Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}
