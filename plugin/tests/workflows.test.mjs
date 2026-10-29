import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  readdir,
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
    "client/ui-compat.tsx",
    "client/i18n.ts",
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
test("failed backup move removes only this invocation's staged skill", () =>
  fixture(async (dir) => {
    const source = join(dir, "source"),
      home = join(dir, "home"),
      backup = join(dir, "backup"),
      root = join(home, ".agents/skills");
    for (const [path, text] of [
      [join(source, "skills/paseo-browser/SKILL.md"), "new"],
      [join(root, "paseo-browser/SKILL.md"), "old"],
      [join(backup, ".agents/paseo-browser/SKILL.md"), "previous backup"],
      [join(root, "unrelated.paseobility-stage/marker"), "keep"],
    ]) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, text);
    }
    await assert.rejects(installSkills(source, home, backup, ["paseo-browser"]));
    assert.deepEqual((await readdir(root)).sort(), [
      "paseo-browser",
      "unrelated.paseobility-stage",
    ]);
    assert.equal(await readFile(join(root, "paseo-browser/SKILL.md"), "utf8"), "old");
    assert.equal(
      await readFile(join(backup, ".agents/paseo-browser/SKILL.md"), "utf8"),
      "previous backup",
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
      const { MESSAGES, fill } = await import("../shared/messages.ts");
      assert.equal(
        job.code,
        mode === "success"
          ? "jobComplete"
          : mode === "uncertain"
            ? "jobUncertain"
            : "jobFailed",
      );
      assert.equal(job.message, fill(MESSAGES.en[job.code], job.values ?? {}));
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
  // Paseo renders the + menu entry as `Attach ${title}` in English on 0.12 and
  // 0.13, so the title is the brand alone and never mixes languages.
  assert.equal(MESSAGES.en.attachmentTitle, "Paseobility");
  assert.equal(MESSAGES.ko.attachmentTitle, "Paseobility");
  assert.equal(MESSAGES.en.attachmentSearchPlaceholder, "Search skills");
  assert.equal(MESSAGES.ko.attachmentPickerTitle, "Paseobility 스킬");
  assert.equal(MESSAGES.ko.attachmentSearchPlaceholder, "스킬 검색");
  assert.equal(MESSAGES.ko.commandCenterTitle, "Paseobility 열기");
});

const placeholders = (text) =>
  new Set(Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]));

test("English and Korean messages share the same placeholders", async () => {
  const { MESSAGES } = await import("../shared/messages.ts");
  assert.deepEqual(Object.keys(MESSAGES.ko).sort(), Object.keys(MESSAGES.en).sort());
  for (const key of Object.keys(MESSAGES.en))
    assert.deepEqual(
      [...placeholders(MESSAGES.ko[key])].sort(),
      [...placeholders(MESSAGES.en[key])].sort(),
      `${key} placeholders differ`,
    );
});

test("fill substitutes known placeholders and pickLocale maps only Korean", async () => {
  const { fill, pickLocale } = await import("../shared/messages.ts");
  assert.equal(fill("{count} skills", { count: 11 }), "11 skills");
  assert.equal(
    fill("{installed} of {total} installed", { installed: 3, total: 11 }),
    "3 of 11 installed",
  );
  assert.equal(fill("{known} {unknown}", { known: "yes" }), "yes {unknown}");
  assert.equal(fill("no placeholders", {}), "no placeholders");
  for (const locale of ["ko", "ko-KR", "KO"])
    assert.equal(pickLocale(locale), "ko", String(locale));
  for (const locale of ["en", "en-US", "ja", "", undefined, null])
    assert.equal(pickLocale(locale), "en", String(locale));
  // Konkani starts with "ko" but is not Korean.
  assert.equal(pickLocale("kok"), "en");
});

test("withAlpha converts hex and rgb, clamps alpha and falls back", async () => {
  const { withAlpha } = await import("../shared/color.ts");
  assert.equal(withAlpha("#fff", 0.5, "fallback"), "rgba(255, 255, 255, 0.5)");
  assert.equal(
    withAlpha("#ffffff", 0.5, "fallback"),
    "rgba(255, 255, 255, 0.5)",
  );
  assert.equal(withAlpha("rgb(1, 2, 3)", 0.2, "fallback"), "rgba(1, 2, 3, 0.2)");
  assert.equal(withAlpha("#000000", 2, "fallback"), "rgba(0, 0, 0, 1)");
  assert.equal(withAlpha("#000000", -1, "fallback"), "rgba(0, 0, 0, 0)");
  assert.equal(withAlpha("hsl(0 0% 0%)", 0.5, "fallback"), "fallback");
});

test("workflow metadata is complete and uses verified Lucide icons", async () => {
  const { WORKFLOWS } = await import("../shared/workflows.ts");
  // Lucide names that exist in both the Paseo 0.12 and 0.13 bundles.
  const icons = new Set([
    "Globe",
    "MousePointerClick",
    "FolderSearch",
    "Palette",
    "Share2",
    "ShieldCheck",
    "Smartphone",
    "MonitorSmartphone",
    "Archive",
    "Target",
    "Users",
  ]);
  const ids = new Set();
  for (const skill of WORKFLOWS) {
    assert.ok(skill.id.trim(), "empty skill id");
    assert.ok(!ids.has(skill.id), `duplicate skill id ${skill.id}`);
    ids.add(skill.id);
    assert.ok(icons.has(skill.icon), `${skill.id} uses unverified icon ${skill.icon}`);
    assert.equal([...skill.glyph].length, 1, `${skill.id} glyph is one character`);
    for (const field of ["title", "hint"])
      assert.ok(skill[field].trim(), `${skill.id} ${field} is empty`);
    for (const field of ["title", "hint"])
      assert.ok(skill.en[field].trim(), `${skill.id} en.${field} is empty`);
  }
});

const BANNED_UI_IMPORTS = new Set([
  "Icon",
  "Loading",
  "Markdown",
  "useToast",
  "copyText",
  "Modal",
  "StreamedText",
  "DocumentFrame",
  "ScrollView",
  "FlatList",
  "TextInput",
]);
const BANNED_CLIENT_IMPORTS = new Set([
  "defineTranslations",
  "useTranslation",
  "useTabState",
  "useHosts",
  "getPaseoClient",
  "openExternalUrl",
]);

// Named imports from one module. Default and namespace imports are ignored.
function namedImports(text, module) {
  const names = [];
  const imports = /import\s+(?:type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of text.matchAll(imports)) {
    if (match[2] !== module) continue;
    const braces = /\{([\s\S]*)\}/.exec(match[1]);
    if (!braces) continue;
    for (const piece of braces[1].split(",")) {
      const entry = piece.replace(/\/\/.*$/gm, "").trim();
      if (!entry) continue;
      const name = entry.replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

async function clientSources() {
  const root = new URL("../", import.meta.url);
  const files = (await readdir(new URL("client/", root), { recursive: true }))
    .filter((name) => /\.(ts|tsx|js|jsx)$/.test(name))
    .map((name) => "client/" + name.replaceAll("\\", "/"));
  files.push("index.client.tsx");
  return Promise.all(
    files.map(async (file) => ({
      file,
      text: await readFile(new URL(file, root), "utf8"),
    })),
  );
}

test("client sources avoid 0.13-only named imports so one bundle runs on 0.12", async () => {
  for (const { file, text } of await clientSources()) {
    for (const name of namedImports(text, "@getpaseo/plugin/client/ui"))
      assert.ok(
        !BANNED_UI_IMPORTS.has(name),
        `${file} imports ${name} from @getpaseo/plugin/client/ui`,
      );
    for (const name of namedImports(text, "@getpaseo/plugin/client"))
      assert.ok(
        !BANNED_CLIENT_IMPORTS.has(name),
        `${file} imports ${name} from @getpaseo/plugin/client`,
      );
  }
});

test("plugin screens use the host system font", async () => {
  const root = new URL("../client/", import.meta.url);
  for (const name of await readdir(root)) {
    if (!name.endsWith(".tsx")) continue;
    const text = await readFile(new URL(name, root), "utf8");
    assert.doesNotMatch(
      text,
      /Apple SD Gothic Neo|Malgun Gothic/,
      `${name} sets a custom font`,
    );
  }
});

// Units S and P are rewriting these screens to take every visible string from
// shared/messages.ts and shared/workflows.ts. This guard fails until they land;
// it exists so hardcoded Korean cannot come back.
test("visible component text comes from shared messages, not hardcoded Korean", async () => {
  for (const file of ["client/screen.tsx", "client/pills.tsx"]) {
    const text = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /[\uAC00-\uD7A3]/, `${file} contains Hangul`);
  }
});

test("server and update text is English with a Korean message for each code", async () => {
  for (const file of [
    "client/web.ts",
    "server/management.ts",
    "server/update-worker.mjs",
    "server/update-core.mjs",
  ]) {
    const text = await readFile(new URL("../" + file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /[가-힣]/, `${file} contains Hangul`);
  }
  // The worker runs standalone and repeats the English text; keep it in sync.
  const { MESSAGES } = await import("../shared/messages.ts");
  const worker = await readFile(
    new URL("../server/update-worker.mjs", import.meta.url),
    "utf8",
  );
  const calls = [
    ...worker.matchAll(/"(job\w+)",\s*(?:"((?:[^"\\]|\\.)*)"|`([^`]*)`)/g),
  ];
  assert.equal(calls.length, 7);
  for (const [, code, plain, template] of calls) {
    const text = plain ?? template.replace(/\$\{(\w+)\}/g, "{$1}");
    assert.equal(text, MESSAGES.en[code], code);
  }
});

test("server text and update progress follow the chosen language", async () => {
  const { MESSAGES, localizeServerText, jobText } = await import(
    "../shared/messages.ts"
  );
  const wrapped = `RPC failed: ${MESSAGES.en.errReleaseChanged}`;
  assert.equal(localizeServerText(wrapped, "en"), wrapped);
  assert.equal(
    localizeServerText(wrapped, "ko"),
    `RPC failed: ${MESSAGES.ko.errReleaseChanged}`,
  );
  assert.equal(localizeServerText("ENOENT: other", "ko"), "ENOENT: other");
  const job = {
    code: "jobComplete",
    values: { version: "2.13.0" },
    message: "Updated to v2.13.0. New conversations use the updated skills.",
  };
  assert.equal(jobText(job, "en"), job.message);
  assert.match(jobText(job, "ko"), /^v2\.13\.0으로 업데이트했습니다/);
  // Jobs written by older workers have no code; show their text unchanged.
  assert.equal(jobText({ message: "업데이트 중" }, "en"), "업데이트 중");
  assert.equal(
    jobText({ message: MESSAGES.en.jobStalled }, "ko"),
    MESSAGES.ko.jobStalled,
  );
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
