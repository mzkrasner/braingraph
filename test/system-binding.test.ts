import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { test } from "vitest";

import {
  loadLocalState,
  LOCAL_STATE_NAME,
  validateLocalState,
} from "../src/local-state.js";

import {
  parseJsonObject,
  readWorkspaceManifest,
  runCli,
  temporaryDirectory,
} from "./helpers.js";

async function createBrain(
  account = "research@example.invalid",
  extra: readonly string[] = [],
): Promise<string> {
  const workspace = path.join(temporaryDirectory(), "workspace");
  const init = await runCli(["init", workspace, "--name", "Research"]);
  assert.equal(init.status, 0, init.stderr);
  const add = await runCli([
    "system",
    "add",
    "mail",
    "--workspace",
    workspace,
    "--name",
    "Mail",
    "--role",
    "source",
    "--owns",
    "correspondence",
    "--identifier",
    "message ID",
    "--read",
    "connector",
    "--fallback",
    "Stop if identity is unresolved.",
    ...(account.length === 0 ? [] : ["--expected-account", account]),
    ...extra,
  ]);
  assert.equal(add.status, 0, add.stderr);
  return workspace;
}

function bindingArgs(
  workspace: string,
  operation: "bind" | "check",
  account = "research@example.invalid",
  connector = "mail-session-a",
): string[] {
  return [
    "system",
    operation,
    "mail",
    "--workspace",
    workspace,
    "--connector",
    connector,
    "--account",
    account,
  ];
}

test("portable identity is optional for old manifests, but unbound connectors fail closed", async () => {
  const workspace = await createBrain("");
  const status = await runCli([
    "system",
    "status",
    "--workspace",
    workspace,
    "--json",
  ]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /"state": "unbound"/);
  assert.match(status.stdout, /"liveIdentityVerified": false/);
  const bind = await runCli(bindingArgs(workspace, "bind"));
  assert.equal(bind.status, 2);
  assert.match(bind.stderr, /expected identity is undeclared/);
  const check = await runCli(bindingArgs(workspace, "check"));
  assert.equal(check.status, 2);
  assert.match(check.stderr, /blocked/);
  assert.equal(fs.existsSync(path.join(workspace, LOCAL_STATE_NAME)), false);
});

test("bindings isolate two brains sharing a provider and system id", async () => {
  const research = await createBrain();
  const community = await createBrain("community@example.invalid");
  const before = fs.readFileSync(
    path.join(research, "braingraph.json"),
    "utf8",
  );
  assert.equal((await runCli(bindingArgs(research, "bind"))).status, 0);
  assert.equal(
    (
      await runCli(
        bindingArgs(
          community,
          "bind",
          "community@example.invalid",
          "mail-session-b",
        ),
      )
    ).status,
    0,
  );
  assert.equal(
    fs.readFileSync(path.join(research, "braingraph.json"), "utf8"),
    before,
  );

  const own = await runCli(bindingArgs(research, "check"), { cwd: community });
  assert.equal(own.status, 0, own.stderr);
  assert.match(own.stdout, /No provider was contacted/);
  const wrong = await runCli(
    bindingArgs(
      research,
      "check",
      "community@example.invalid",
      "mail-session-b",
    ),
    { cwd: community },
  );
  assert.equal(wrong.status, 2);
  assert.match(wrong.stderr, /connector does not match this workspace/);
  const wrongAccount = await runCli(
    bindingArgs(research, "check", "community@example.invalid"),
  );
  assert.equal(wrongAccount.status, 2);
  assert.match(wrongAccount.stderr, /account does not match/);
  assert.equal(
    (
      await runCli(
        bindingArgs(
          community,
          "check",
          "community@example.invalid",
          "mail-session-b",
        ),
      )
    ).status,
    0,
  );
  const status = await runCli([
    "system",
    "status",
    "mail",
    "--workspace",
    research,
  ]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /configured/);
  assert.match(status.stdout, /live identity is not verified/);
});

test("binding dry run preserves local attachments and creates no mapping", async () => {
  const workspace = await createBrain();
  const localFile = path.join(workspace, LOCAL_STATE_NAME);
  const existing = {
    schemaVersion: 1,
    attachments: {
      app: {
        checkoutPath: path.join(temporaryDirectory(), "app"),
        bridge: false,
      },
    },
  };
  fs.writeFileSync(localFile, JSON.stringify(existing));
  const before = fs.readFileSync(localFile, "utf8");
  const dryRun = await runCli([...bindingArgs(workspace, "bind"), "--dry-run"]);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /dry-run/);
  assert.equal(fs.readFileSync(localFile, "utf8"), before);
  const unbound = await runCli(bindingArgs(workspace, "check"));
  assert.equal(unbound.status, 2);
  assert.match(unbound.stderr, /no connector binding exists/);
  assert.equal((await runCli(bindingArgs(workspace, "bind"))).status, 0);
  assert.deepEqual(loadLocalState(workspace).attachments, existing.attachments);
  assert.equal(
    Object.keys(loadLocalState(workspace).systemBindings ?? {}).length,
    1,
  );
});

test("all declared identity fields and saved principal observations must match exactly", async () => {
  const workspace = await createBrain("research@example.invalid", [
    "--expected-tenant",
    "tenant-a",
    "--expected-principal",
    "user-a",
  ]);
  const missing = await runCli(bindingArgs(workspace, "bind"));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /tenant is unresolved/);
  const complete = [
    ...bindingArgs(workspace, "bind"),
    "--tenant",
    "tenant-a",
    "--principal",
    "user-a",
  ];
  assert.equal((await runCli(complete)).status, 0);
  assert.equal(
    (
      await runCli([
        ...bindingArgs(workspace, "check"),
        "--tenant",
        "tenant-a",
        "--principal",
        "user-a",
      ])
    ).status,
    0,
  );
  const absent = await runCli(bindingArgs(workspace, "check"));
  assert.equal(absent.status, 2);
  assert.match(absent.stderr, /principal is unresolved/);
  const wrongCase = await runCli([
    ...bindingArgs(workspace, "check", "Research@example.invalid"),
    "--tenant",
    "tenant-a",
    "--principal",
    "user-a",
  ]);
  assert.equal(wrongCase.status, 2);
  assert.match(wrongCase.stderr, /account does not match/);

  const update = await runCli([
    "system",
    "update",
    "mail",
    "--workspace",
    workspace,
    "--expected-principal=",
    "--expected-tenant=",
  ]);
  assert.equal(update.status, 0, update.stderr);
  assert.deepEqual(
    readWorkspaceManifest(workspace).externalSystems[0]?.identity,
    { account: "research@example.invalid" },
  );
  const stalePrincipal = await runCli([
    ...bindingArgs(workspace, "check"),
    "--tenant",
    "tenant-a",
    "--principal",
    "user-b",
  ]);
  assert.equal(stalePrincipal.status, 2);
  assert.match(stalePrincipal.stderr, /saved binding principal does not match/);
  const omittedSavedPrincipal = await runCli(bindingArgs(workspace, "check"));
  assert.equal(omittedSavedPrincipal.status, 2);
  assert.match(
    omittedSavedPrincipal.stderr,
    /saved binding tenant is unresolved/,
  );
});

test("contract changes expose stale bindings and inactive integrations cannot pass", async () => {
  const workspace = await createBrain();
  assert.equal((await runCli(bindingArgs(workspace, "bind"))).status, 0);
  assert.equal(
    (
      await runCli([
        "system",
        "update",
        "mail",
        "--workspace",
        workspace,
        "--expected-account",
        "replacement@example.invalid",
      ])
    ).status,
    0,
  );
  const status = await runCli([
    "system",
    "status",
    "mail",
    "--workspace",
    workspace,
    "--json",
  ]);
  assert.match(status.stdout, /"state": "mismatch"/);
  const stale = await runCli(bindingArgs(workspace, "check"));
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /account does not match/);
  assert.equal(
    (
      await runCli([
        "system",
        "update",
        "mail",
        "--workspace",
        workspace,
        "--status",
        "inactive",
      ])
    ).status,
    0,
  );
  const inactive = await runCli(bindingArgs(workspace, "check"));
  assert.equal(inactive.status, 2);
  assert.match(inactive.stderr, /integration is inactive/);
});

test("status does not invent a global binding, and unknown ids never inherit object properties", async () => {
  const workspace = path.join(temporaryDirectory(), "workspace");
  assert.equal(
    (await runCli(["init", workspace, "--name", "Empty"])).status,
    0,
  );
  const empty = await runCli(["system", "status", "--workspace", workspace]);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /No external systems declared/);
  const unknown = await runCli([
    "system",
    "status",
    "constructor",
    "--workspace",
    workspace,
  ]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /unknown external system/);
  assert.equal(fs.existsSync(path.join(workspace, LOCAL_STATE_NAME)), false);
});

test("binding commands validate invocation and never accept secrets as separate fields", async () => {
  const workspace = await createBrain();
  for (const command of ["bind", "check", "status"]) {
    const help = await runCli(["system", command, "--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /cannot enforce authentication/);
  }
  const missingId = await runCli(["system", "bind", "--workspace", workspace]);
  assert.equal(missingId.status, 2);
  assert.match(missingId.stderr, /requires one id/);
  const tooMany = await runCli([
    "system",
    "status",
    "mail",
    "extra",
    "--workspace",
    workspace,
  ]);
  assert.equal(tooMany.status, 2);
  const missingConnector = await runCli([
    "system",
    "bind",
    "mail",
    "--workspace",
    workspace,
    "--account",
    "research@example.invalid",
  ]);
  assert.equal(missingConnector.status, 2);
  assert.match(missingConnector.stderr, /connector requires/);
  const noIdentity = await runCli([
    "system",
    "bind",
    "mail",
    "--workspace",
    workspace,
    "--connector",
    "session-a",
  ]);
  assert.equal(noIdentity.status, 2);
  assert.match(noIdentity.stderr, /requires at least one/);
  const invalid = await runCli([
    ...bindingArgs(workspace, "bind"),
    "--token",
    "not-a-real-credential",
  ]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /unknown option/);
  const whitespace = await runCli(
    bindingArgs(workspace, "bind", " research@example.invalid"),
  );
  assert.equal(whitespace.status, 2);
  assert.match(whitespace.stderr, /trimmed/);
});

test("machine-local binding validator rejects malformed identity and unknown credential-shaped fields", () => {
  const valid = {
    schemaVersion: 1,
    attachments: {},
    systemBindings: {
      mail: {
        connector: "session-a",
        identity: { account: "research@example.invalid" },
        recordedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  assert.deepEqual(validateLocalState(valid), []);
  assert.deepEqual(
    validateLocalState({ schemaVersion: 1, attachments: {} }),
    [],
  );
  for (const bindings of [
    null,
    [],
    { "Bad Id": null },
    {
      mail: {
        connector: " ",
        identity: [],
        recordedAt: "not-a-date",
        token: "not-a-real-credential",
      },
    },
  ]) {
    assert.notDeepEqual(
      validateLocalState({
        schemaVersion: 1,
        attachments: {},
        systemBindings: bindings,
      }),
      [],
    );
  }
  assert.match(
    validateLocalState({ ...valid, token: "not-a-real-credential" }).join("; "),
    /unsupported local state field/,
  );
  assert.match(
    validateLocalState({
      ...valid,
      systemBindings: {
        mail: {
          ...valid.systemBindings.mail,
          identity: { token: "not-a-real-credential" },
        },
      },
    }).join("; "),
    /unsupported field: token/,
  );
});

test.skipIf(process.platform === "win32")(
  "local state cannot point into another brain through a symlink",
  async () => {
    const first = await createBrain();
    const second = await createBrain("community@example.invalid");
    assert.equal(
      (await runCli(bindingArgs(second, "bind", "community@example.invalid")))
        .status,
      0,
    );
    const secondFile = path.join(second, LOCAL_STATE_NAME);
    const before = fs.readFileSync(secondFile, "utf8");
    fs.symlinkSync(secondFile, path.join(first, LOCAL_STATE_NAME));
    const result = await runCli(bindingArgs(first, "bind"));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /outside|escapes/);
    assert.equal(fs.readFileSync(secondFile, "utf8"), before);
    assert.equal(
      Object.keys(parseJsonObject(before)).includes("systemBindings"),
      true,
    );
  },
);
