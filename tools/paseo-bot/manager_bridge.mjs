// VAXPORT-only manager transport. Never prints config, prompts, tools or stderr.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
const req = JSON.parse(fs.readFileSync(0, "utf8"));
let client;
async function main() {
  const module = process.env.PASEO_MULTI_HOST_CLIENT_MODULE;
  const { connectToDaemon } = await import(pathToFileURL(module).href);
  client = await connectToDaemon({
    target: {
      kind: "instance",
      home: process.env.PASEO_HOME || path.join(os.homedir(), ".paseo"),
    },
    timeout: 10000,
  });
  const status = await client.getDaemonStatus({ timeout: 10000 });
  if (status.serverId !== req.serverId) throw Error("identity");
  if (req.action === "recover") {
    let cursor;
    const agents = [];
    for (let i = 0; i < 50; i++) {
      const r = await client.fetchAgents({
        includeBackground: true,
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
        timeout: 10000,
      });
      agents.push(
        ...r.entries
          .filter(
            (e) =>
              e.agent.labels?.paseo_bot_gui === req.session &&
              !e.agent.archivedAt,
          )
          .map((e) => ({ id: e.agent.id })),
      );
      if (!r.pageInfo.hasMore) return { agents };
      cursor = r.pageInfo.nextCursor;
      if (!cursor) throw Error("schema");
    }
    throw Error("pagination");
  }
  if (req.action === "create") {
    let p;
    for (let i = 0; i < 5; i++) {
      const providers = await client.getProvidersSnapshot({ cwd: req.cwd });
      p = providers.entries?.find((p) => p.provider === req.provider);
      if (p?.enabled && p.status === "ready") break;
      if (i < 4) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
    // The manager only plans and explains; operators can pin a narrower mode.
    const mode = req.mode || "full-access";
    if (
      !p?.enabled ||
      p.status !== "ready" ||
      !p.modes?.some((m) => m.id === mode)
    )
      throw Error("provider");
    const cli = path.join(path.dirname(path.dirname(module)), "index.js");
    const prefix = JSON.parse(process.env.PASEO_BOT_RUNTIME_PREFIX || "[]");
    const args = [
      ...prefix,
      cli,
      "run",
      "--no-wait",
      "--json",
      "--provider",
      req.provider,
      "--model",
      req.model,
      "--mode",
      mode,
      "--thinking",
      req.thinking || "high",
      "--cwd",
      req.cwd,
      "--new-workspace",
      "local",
      "--title",
      "Paseo bot GUI manager",
      "--label",
      "paseo_bot_gui=" + req.session,
      "--",
      req.prompt,
    ];
    return await new Promise((resolve, reject) => {
      const env = { ...process.env };
      for (const k of ["PASEO_AGENT_ID", "PASEO_WORKSPACE_ID"]) delete env[k];
      const c = spawn(process.execPath, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      const timer = setTimeout(() => {
        c.kill();
        reject(Error("unknown"));
      }, 45000);
      c.stdout.on("data", (b) => {
        out += b;
        if (out.length > 1000000) c.kill();
      });
      c.stderr.resume();
      c.on("error", () => {
        clearTimeout(timer);
        reject(Error("create"));
      });
      c.on("close", (code) => {
        clearTimeout(timer);
        try {
          const r = JSON.parse(out);
          const d = r.data || r;
          if (code || !d.agentId) throw Error();
          resolve({ id: d.agentId });
        } catch {
          reject(Error("receipt"));
        }
      });
    });
  }
  const current = await client.fetchAgent({
    agentId: req.agentId,
    timeout: 10000,
  });
  if (
    !current?.agent ||
    current.agent.archivedAt ||
    current.agent.labels?.paseo_bot_gui !== req.session
  )
    throw Error("ownership");
  if (req.action === "send") {
    if (current.agent.status !== "idle") throw Error("busy");
    await client.sendMessage(req.agentId, req.prompt);
    return { accepted: true };
  }
  if (req.action === "observe") {
    const r = await client.waitForFinish(req.agentId, 1000);
    return { status: r.status, message: r.lastMessage || "" };
  }
  if (req.action === "find") {
    const { fetchProjectedTimelineItems } = await import(
      pathToFileURL(path.join(path.dirname(module), "timeline.js")).href
    );
    const items = await fetchProjectedTimelineItems({
      client,
      agentId: req.agentId,
      timeoutMs: 10000,
    });
    return {
      found: items.some(
        (i) =>
          i.type === "user_message" &&
          typeof i.text === "string" &&
          i.text.includes(req.marker),
      ),
    };
  }
  throw Error("action");
}
try {
  process.stdout.write(JSON.stringify({ ok: true, result: await main() }));
} catch {
  process.stdout.write(
    '{"ok":false,"error":"Manager transport unavailable; outcome may be unknown."}',
  );
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
}
