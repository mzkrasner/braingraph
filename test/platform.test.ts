import assert from "node:assert/strict";

import { test } from "vitest";

import { platformOpenAction } from "../src/commands/obsidian.js";
import {
  isObsidianInstalled,
  resolveObsidianInstallAction,
} from "../src/commands/tools.js";

test("Obsidian open actions are portable across supported platforms", () => {
  assert.deepEqual(platformOpenAction("obsidian://open", "darwin"), {
    command: "open",
    args: ["obsidian://open"],
  });
  assert.deepEqual(platformOpenAction("obsidian://open", "win32"), {
    command: "cmd",
    args: ["/c", "start", "", "obsidian://open"],
  });
  assert.deepEqual(platformOpenAction("obsidian://open", "linux"), {
    command: "xdg-open",
    args: ["obsidian://open"],
  });
});

test("Obsidian detection checks native application and command locations", () => {
  assert.equal(
    isObsidianInstalled({
      platform: "darwin",
      homeDirectory: "/home/example",
      exists: (candidate) => candidate === "/Applications/Obsidian.app",
    }),
    true,
  );
  assert.equal(
    isObsidianInstalled({ platform: "darwin", exists: () => false }),
    false,
  );
  assert.equal(
    isObsidianInstalled({
      platform: "win32",
      localAppData: "C:\\Users\\Example\\AppData\\Local",
      exists: (candidate) => candidate.endsWith("Obsidian.exe"),
      commandAvailable: () => false,
    }),
    true,
  );
  assert.equal(
    isObsidianInstalled({
      platform: "win32",
      commandAvailable: (command) => command === "obsidian",
    }),
    true,
  );
  assert.equal(
    isObsidianInstalled({
      platform: "linux",
      commandAvailable: (command) => command === "obsidian-appimage",
    }),
    true,
  );
  assert.equal(
    isObsidianInstalled({
      platform: "linux",
      commandAvailable: () => false,
    }),
    false,
  );
});

test("Obsidian installation resolves package-manager and manual paths", () => {
  const macCommand = resolveObsidianInstallAction(
    "darwin",
    (command) => command === "brew",
  );
  assert.equal(macCommand.kind, "command");
  assert.equal(macCommand.command, "brew");

  const windowsCommand = resolveObsidianInstallAction(
    "win32",
    (command) => command === "winget",
  );
  assert.equal(windowsCommand.kind, "command");
  assert.equal(windowsCommand.command, "winget");

  assert.equal(
    resolveObsidianInstallAction("darwin", () => false).kind,
    "manual",
  );
  assert.equal(
    resolveObsidianInstallAction("win32", () => false).kind,
    "manual",
  );
  assert.equal(resolveObsidianInstallAction("linux").kind, "manual");
});
