import fs from "node:fs";
import path from "node:path";

import { readJson } from "./files.js";
import { assertCanonicalPathInside, resolveInside } from "./util.js";

export interface ObsidianConfigCheck {
  name: string;
  status: "ok" | "error";
  detail: string;
}

/** Validates editable vault settings, including both supported plugin encodings. */
export function obsidianConfigChecks(vault: string): ObsidianConfigCheck[] {
  const validators: readonly [string, (value: unknown) => void][] = [
    [
      "app.json",
      (value): void => {
        validateApp(vault, value);
      },
    ],
    [
      "templates.json",
      (value): void => {
        validateTemplates(vault, value);
      },
    ],
    ["core-plugins.json", validatePlugins],
  ];
  return validators.map(([name, validate]) => {
    try {
      const file = path.join(vault, ".obsidian", name);
      assertCanonicalPathInside(vault, file, "Obsidian configuration");
      validate(readJson(file));
      return {
        name: `obsidian:config:${name}`,
        status: "ok",
        detail:
          "valid configuration (GUI editing round trip remains a separate acceptance check)",
      };
    } catch (error: unknown) {
      return {
        name: `obsidian:config:${name}`,
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

function validateApp(vault: string, value: unknown): void {
  const app = objectValue(value);
  if (typeof app.alwaysUpdateLinks !== "boolean")
    throw new TypeError("alwaysUpdateLinks must be boolean");
  if (app.newFileLocation !== "folder")
    throw new TypeError(
      "newFileLocation must be folder to route intake deliberately",
    );
  validateFolder(vault, app.newFileFolderPath, "newFileFolderPath");
  validateFolder(vault, app.attachmentFolderPath, "attachmentFolderPath");
}

function validateTemplates(vault: string, value: unknown): void {
  validateFolder(vault, objectValue(value).folder, "templates folder");
}

function validateFolder(vault: string, value: unknown, label: string): void {
  if (typeof value !== "string")
    throw new TypeError(`${label} must be a vault-relative folder`);
  const folder = resolveInside(vault, value, label);
  assertCanonicalPathInside(vault, folder, label);
  if (!fs.statSync(folder).isDirectory())
    throw new TypeError(`${label} must name an existing directory`);
}

function validatePlugins(value: unknown): void {
  if (Array.isArray(value)) {
    if (!value.every((entry: unknown) => typeof entry === "string"))
      throw new TypeError("core-plugins must contain plugin names");
    if (!value.includes("templates"))
      throw new TypeError("Templates core plugin must be enabled");
    return;
  }
  const plugins = objectValue(value);
  if (!Object.values(plugins).every((entry) => typeof entry === "boolean"))
    throw new TypeError("core-plugins map values must be boolean");
  if (plugins.templates !== true)
    throw new TypeError("Templates core plugin must be enabled");
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("expected a JSON object");
  return value as Record<string, unknown>;
}
