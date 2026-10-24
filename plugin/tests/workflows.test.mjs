import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSkill } from "../shared/workflows.ts";
import { treeDigest, installSkills, rollback } from "../server/update-core.mjs";
test("preserves the complete draft, whitespace and other skill references", () => {
  const draft = "  기존 질문\n두 번째 줄  ";
  assert.equal(
    appendSkill(draft, "paseo-browser"),
    draft + "\n/paseo-browser ",
  );
  assert.equal(appendSkill("", "paseo-design"), "/paseo-design ");
  assert.equal(appendSkill("내용\n", "paseo-design"), "내용\n/paseo-design ");
  assert.equal(
    appendSkill("/paseo-share 내용", "paseo-browser"),
    "/paseo-share 내용\n/paseo-browser ",
  );
});
test("repeated skill selection is idempotent, with whole-token matching", () => {
  const first = appendSkill("질문", "paseo-browser");
  assert.equal(appendSkill(first, "paseo-browser"), first);
  assert.equal(
    appendSkill("/paseo-browser-extra", "paseo-browser"),
    "/paseo-browser-extra\n/paseo-browser ",
  );
  assert.throws(() => appendSkill("original", "../../bad"));
});
test("source has no agent send/creation path", async () => {
  for (const file of [
    "client/pills.tsx",
    "client/web.ts",
    "index.client.tsx",
  ]) {
    const text = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(
      text,
      /\.send\(|agents\.create\(|\.submit\(|requestSubmit\(/,
    );
  }
});
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), "paseobility-update-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("update backs up existing skills, verifies bytes and rolls back without touching unrelated skills", () =>
  fixture(async (dir) => {
    const source = join(dir, "source"),
      home = join(dir, "home"),
      backup = join(dir, "backup");
    for (const [path, text] of [
      [join(source, "skills/paseo-browser/SKILL.md"), "new"],
      [join(home, ".agents/skills/paseo-browser/SKILL.md"), "old"],
      [join(home, ".agents/skills/private/SKILL.md"), "private"],
    ]) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, text);
    }
    const changes = await installSkills(source, home, backup, [
      "paseo-browser",
    ]);
    assert.equal(
      await readFile(
        join(home, ".agents/skills/paseo-browser/SKILL.md"),
        "utf8",
      ),
      "new",
    );
    assert.equal(
      await readFile(join(backup, ".agents/paseo-browser/SKILL.md"), "utf8"),
      "old",
    );
    await rollback(changes);
    assert.equal(
      await readFile(
        join(home, ".agents/skills/paseo-browser/SKILL.md"),
        "utf8",
      ),
      "old",
    );
    assert.equal(
      await readFile(join(home, ".agents/skills/private/SKILL.md"), "utf8"),
      "private",
    );
  }));
test("partial installation failure restores prior skills", () =>
  fixture(async (dir) => {
    const source = join(dir, "source"),
      home = join(dir, "home");
    for (const [path, text] of [
      [join(source, "skills/paseo-browser/SKILL.md"), "new"],
      [join(home, ".agents/skills/paseo-browser/SKILL.md"), "old"],
    ]) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, text);
    }
    await assert.rejects(
      installSkills(source, home, join(dir, "backup"), [
        "paseo-browser",
        "paseo-missing",
      ]),
    );
    assert.equal(
      await readFile(
        join(home, ".agents/skills/paseo-browser/SKILL.md"),
        "utf8",
      ),
      "old",
    );
  }));
test("rollback refuses to delete concurrent user edits", () =>
  fixture(async (dir) => {
    const source = join(dir, "source"),
      home = join(dir, "home");
    const file = join(source, "skills/paseo-browser/SKILL.md");
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, "new");
    const changes = await installSkills(source, home, join(dir, "backup"), [
      "paseo-browser",
    ]);
    const target = join(home, ".agents/skills/paseo-browser/SKILL.md");
    await writeFile(target, "user edit");
    await assert.rejects(rollback(changes));
    assert.equal(await readFile(target, "utf8"), "user edit");
  }));
test(
  "release trees reject links to files outside their root",
  { skip: process.platform === "win32" },
  () =>
    fixture(async (dir) => {
      await mkdir(join(dir, "tree"));
      await writeFile(join(dir, "private"), "private");
      await symlink(join(dir, "private"), join(dir, "tree/link"));
      await assert.rejects(treeDigest(join(dir, "tree")));
    }),
);

test("Windows CLI arguments stay data, including Unicode and shell characters", async () => {
  const { invocation } = await import("../server/update-core.mjs");
  const args = [
    "plugin",
    "add",
    "C:\\한글 & $() `x`\\plugin",
    "--home",
    "C:\\a b",
  ];
  const call = invocation("paseo.cmd", args, "win32");
  assert.equal(call.command, "powershell.exe");
  const script = Buffer.from(call.args.at(-1), "base64").toString("utf16le");
  const encoded = script.match(/FromBase64String\('([^']+)'\)/)[1];
  assert.deepEqual(
    JSON.parse(Buffer.from(encoded, "base64").toString("utf8")),
    { command: "paseo.cmd", args },
  );
  assert.ok(!script.includes(args[2]));
});

test("displayed plugin version agrees with package version", async () => {
  const source = await readFile(
    new URL("../shared/management.ts", import.meta.url),
    "utf8",
  );
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.ok(source.includes(`PLUGIN_VERSION = "${pkg.version}"`));
});

for (const mode of ["success", "failure", "uncertain"])
  test("update worker " + mode + " keeps source and backups", () =>
    fixture(async (dir) => {
      const { updatePackage } = await import("../server/update-worker.mjs");
      const stateDir = join(dir, "state"),
        home = join(dir, "home");
      await mkdir(stateDir);
      await writeFile(join(stateDir, "update.lock"), "");
      const target = join(home, ".agents/skills/paseo-browser/SKILL.md");
      await mkdir(join(target, ".."), { recursive: true });
      await writeFile(target, "old");
      let staged = "",
        restored = false;
      const commands = [];
      async function execute(command, args) {
        commands.push([command, ...args]);
        if (command === "git") {
          if (args[0] === "init") staged = args.at(-1);
          if (args.includes("rev-parse")) return "a".repeat(40);
          if (args.includes("checkout")) {
            await mkdir(join(staged, "skills/paseo-browser"), {
              recursive: true,
            });
            await mkdir(join(staged, "plugin"));
            await writeFile(
              join(staged, "skills/paseo-browser/SKILL.md"),
              "new",
            );
            await writeFile(join(staged, "VERSION"), "2.13.0");
            await writeFile(
              join(staged, "plugin/package.json"),
              JSON.stringify({ version: "2.13.0" }),
            );
            await writeFile(
              join(staged, "plugin/paseo-plugin.json"),
              JSON.stringify({ id: "paseobility" }),
            );
          }
          return "";
        }
        if (args[1] === "add" && args[2] === "original-plugin") {
          restored = true;
          return "";
        }
        if (args[1] === "add" && mode !== "success") {
          const e = Error("test failure");
          e.uncertain = mode === "uncertain";
          throw e;
        }
        return JSON.stringify([
          {
            id: "paseobility",
            status: "running",
            path: join(staged, "plugin"),
          },
        ]);
      }
      await updatePackage(
        {
          stateDir,
          version: "2.13.0",
          sha: "a".repeat(40),
          home,
          daemonHome: join(dir, "daemon"),
          cli: "fake-paseo",
          oldPlugin: "original-plugin",
        },
        execute,
      );
      const job = JSON.parse(
        await readFile(join(stateDir, "job.json"), "utf8"),
      );
      assert.equal(
        job.phase,
        mode === "success"
          ? "complete"
          : mode === "uncertain"
            ? "interrupted"
            : "failed",
      );
      assert.equal(
        await readFile(target, "utf8"),
        mode === "failure" ? "old" : "new",
      );
      assert.equal(restored, mode === "failure");
      assert.ok(!commands.some((x) => x.includes("restart")));
      if (mode === "success") {
        const receipt = JSON.parse(
          await readFile(join(stateDir, "installed.json"), "utf8"),
        );
        assert.equal(receipt.sha, "a".repeat(40));
        assert.equal(
          await readFile(
            join(job.backup, ".agents/paseo-browser/SKILL.md"),
            "utf8",
          ),
          "old",
        );
      }
      if (mode === "uncertain")
        assert.equal(await readFile(join(stateDir, "update.lock"), "utf8"), "");
    }),
  );

test("pill lifecycle ignores stale snapshots, preserves registrations, removes archived agents and stops late work", async () => {
  const { followAgentPills } = await import("../client/agent-pills.ts");
  let update,
    resolveList,
    stopped = false;
  const adds = [],
    removes = [];
  const client = {
    paseo: {
      agents: {
        subscribe(fn) {
          update = fn;
          return () => {
            stopped = true;
          };
        },
        list() {
          return new Promise((resolve) => {
            resolveList = resolve;
          });
        },
      },
    },
    addComposerPill(c) {
      adds.push(c);
      return {
        remove() {
          removes.push(c.agentId);
        },
      };
    },
  };
  const stop = followAgentPills(client, {
    title: "test",
    icon: "Sparkles",
    behavior: { kind: "action", onPress() {} },
  });
  const agent = { id: "a", workspaceId: "w" };
  update({ kind: "upsert", agent });
  update({ kind: "upsert", agent });
  assert.equal(adds.length, 1);
  update({ kind: "upsert", agent: { ...agent, archivedAt: "now" } });
  assert.equal(removes.length, 1);
  resolveList({ entries: [{ agent }], pageInfo: { hasMore: false } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adds.length, 1);
  update({ kind: "upsert", agent: { id: "b", workspaceId: "w" } });
  assert.equal(adds.length, 2);
  stop();
  assert.equal(stopped, true);
  assert.deepEqual(removes, ["a", "b"]);
  update({ kind: "upsert", agent });
  assert.equal(adds.length, 2);
  const cleanup = followAgentPills(client, {
    title: "test",
    icon: "Sparkles",
    behavior: { kind: "action", onPress() {} },
  });
  cleanup();
  resolveList({ entries: [{ agent }], pageInfo: { hasMore: false } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(adds.length, 2);
});

test("composer pill adapter failures never escape or repeat every refresh", async () => {
  const { followAgentPills } = await import("../client/agent-pills.ts");
  const button = {
    title: "test",
    icon: "Sparkles",
    behavior: { kind: "action", onPress() {} },
  };
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    let update;
    const client = {
      paseo: {
        agents: {
          subscribe(fn) {
            update = fn;
            return () => {};
          },
          list: async () => ({ entries: [], pageInfo: { hasMore: false } }),
        },
      },
      addComposerPill() {
        throw new Error("draft adapter unavailable");
      },
    };
    const stop = followAgentPills(client, button);
    assert.doesNotThrow(() =>
      update({ kind: "upsert", agent: { id: "a", workspaceId: "w" } }),
    );
    assert.doesNotThrow(() =>
      update({ kind: "upsert", agent: { id: "a", workspaceId: "w" } }),
    );
    assert.equal(warnings.length, 1);
    assert.match(String(warnings[0][0]), /Composer pill unavailable/);
    assert.doesNotThrow(() => stop());
  } finally {
    console.warn = warn;
  }
});

test("macOS CLI uses the app bundle when present and PATH otherwise", async () => {
  const { resolvePaseoCli, BUNDLED_PASEO_CLI } = await import(
    "../server/cli-path.ts"
  );
  assert.equal(
    resolvePaseoCli("darwin", (path) => path === BUNDLED_PASEO_CLI),
    BUNDLED_PASEO_CLI,
  );
  assert.equal(resolvePaseoCli("darwin", () => false), "paseo");
  assert.equal(resolvePaseoCli("linux", () => true), "paseo");
  assert.equal(resolvePaseoCli("win32", () => true), "paseo");
});

test("plugin labels provide the same keys in English and Korean", async () => {
  const { MESSAGES } = await import("../shared/messages.ts");
  const english = Object.keys(MESSAGES.en).sort();
  assert.deepEqual(Object.keys(MESSAGES.ko).sort(), english);
  for (const locale of Object.keys(MESSAGES))
    for (const key of english)
      assert.ok(MESSAGES[locale][key].trim(), `${locale}.${key} is empty`);
  assert.equal(MESSAGES.en.attachmentTitle, "Paseobility skills");
  assert.equal(MESSAGES.en.attachmentSearchPlaceholder, "Search skills");
  assert.equal(MESSAGES.ko.attachmentTitle, "Paseobility 스킬");
  assert.equal(MESSAGES.ko.attachmentSearchPlaceholder, "스킬 검색");
  assert.equal(MESSAGES.ko.commandCenterTitle, "Paseobility 열기");
});

// Minimal local check for the comparators used by requirements.paseo.
function satisfiesRange(version, range) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    assert.ok(match, `unexpected version ${value}`);
    return match.slice(1).map(Number);
  };
  const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const target = parse(version);
  return range
    .trim()
    .split(/\s+/)
    .every((part) => {
      const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(part);
      assert.ok(match, `unsupported comparator ${part}`);
      const order = compare(target, parse(match[2]));
      switch (match[1] ?? "=") {
        case ">=":
          return order >= 0;
        case "<=":
          return order <= 0;
        case ">":
          return order > 0;
        case "<":
          return order < 0;
        default:
          return order === 0;
      }
    });
}

test("manifest supports Paseo 0.12 and 0.13 but not 0.14", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../paseo-plugin.json", import.meta.url), "utf8"),
  );
  const range = manifest.requirements.paseo;
  assert.equal(range, ">=0.12.0 <0.14.0");
  for (const version of ["0.12.0", "0.12.10", "0.13.0", "0.13.9"])
    assert.ok(satisfiesRange(version, range), version);
  for (const version of ["0.11.4", "0.14.0", "1.0.0"])
    assert.ok(!satisfiesRange(version, range), version);
  assert.equal(manifest.translations, undefined);
});
