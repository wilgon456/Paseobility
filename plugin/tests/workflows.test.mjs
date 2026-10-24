import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, canLaunch, createLauncher } from "../shared/workflows.ts";

const idle = {
  id: "agent-a",
  status: "idle",
  workspaceId: "workspace-a",
  pendingPermissions: [],
  activeTurn: null,
};

test("prompt preserves user text and only adds the explicitly selected browser", () => {
  const task = "https://example.com/?q=$HOME\n한글 파일 $(whoami).pdf";
  assert.equal(
    buildPrompt("paseo-project", task, "chrome"),
    `/paseo-project\n${task}`,
  );
  assert.match(
    buildPrompt("paseo-browser", task, "chrome"),
    /이미 실행 중인 Google Chrome/,
  );
  assert.doesNotMatch(buildPrompt("paseo-browser", task), /Ego Lite를 사용/);
  assert.throws(() => buildPrompt("other-skill", task));
  assert.throws(() => buildPrompt("paseo-browser", "   "));
  assert.throws(() => buildPrompt("paseo-browser", "a".repeat(12001)));
});

test("only idle, unarchived, permission-free agents in the selected workspace are eligible", () => {
  assert.equal(canLaunch(idle, "workspace-a"), true);
  for (const agent of [
    null,
    { ...idle, status: "running" },
    { ...idle, status: "closed" },
    { ...idle, archivedAt: "date" },
    { ...idle, activeTurn: { turnId: "x" } },
    { ...idle, pendingPermissions: [{}] },
    { ...idle, pendingPermissions: null },
  ]) {
    assert.equal(canLaunch(agent, "workspace-a"), false);
  }
  assert.equal(canLaunch(idle, "workspace-b"), false);
});

test("fresh state blocks an agent that became busy after listing", async () => {
  let sends = 0;
  const launcher = createLauncher();
  await assert.rejects(
    launcher.launch(
      {
        refresh: async () => ({ agent: { ...idle, status: "running" } }),
        send: async () => {
          sends++;
        },
      },
      "task",
    ),
  );
  assert.equal(sends, 0);
  assert.equal(launcher.state(), "ready");
});

test("concurrent clicks and a second click after acceptance cannot duplicate a message", async () => {
  let release;
  let sends = 0;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const launcher = createLauncher();
  const handle = {
    refresh: async () => {
      await barrier;
      return { agent: idle };
    },
    send: async (text, options) => {
      assert.equal(text, "task");
      assert.equal(options.activeTurnBehavior, "steer");
      sends++;
    },
  };
  const first = launcher.launch(handle, "task");
  await assert.rejects(launcher.launch(handle, "task"));
  release();
  await first;
  await assert.rejects(launcher.launch(handle, "task"));
  assert.equal(sends, 1);
  assert.equal(launcher.state(), "sent");
});

test("lost send acknowledgement stays locked and never retries automatically", async () => {
  let sends = 0;
  const launcher = createLauncher();
  const handle = {
    refresh: async () => ({ agent: idle }),
    send: async () => {
      sends++;
      throw new Error("lost reply");
    },
  };
  await assert.rejects(launcher.launch(handle, "task"), /중복 전송/);
  await assert.rejects(launcher.launch(handle, "task"));
  assert.equal(sends, 1);
  assert.equal(launcher.state(), "uncertain");
});

test("read-only refresh failure can be retried, but workspace mismatch cannot send", async () => {
  const launcher = createLauncher();
  await assert.rejects(
    launcher.launch(
      {
        refresh: async () => {
          throw new Error("offline");
        },
        send: async () => assert.fail(),
      },
      "task",
    ),
  );
  assert.equal(launcher.state(), "ready");
  await assert.rejects(
    launcher.launch(
      {
        refresh: async () => ({ agent: idle }),
        send: async () => assert.fail(),
      },
      "task",
      "wrong-workspace",
    ),
  );
  await launcher.launch(
    { refresh: async () => ({ agent: idle }), send: async () => {} },
    "task",
    "workspace-a",
  );
  assert.equal(launcher.state(), "sent");
});
