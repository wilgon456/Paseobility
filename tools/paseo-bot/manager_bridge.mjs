// VAXPORT-only manager transport. Never prints config, prompts, tools or stderr.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
// One-shot: one JSON request on stdin. Resident (--serve): one JSON request per line, one reply per line,
// reusing a single daemon connection so chat polling does not pay a process start + connect each time.
const SERVE = process.argv.includes("--serve");
let req = SERVE ? null : JSON.parse(fs.readFileSync(0, "utf8"));
let client;
let verifiedServer = "";
async function workspaceExists(id) {
  const listed = await client.fetchWorkspaces({
    filter: { query: id, includeBackground: true },
    page: { limit: 200 },
  });
  if (!Array.isArray(listed?.entries)) throw Error("schema");
  return listed.entries.some((w) => w.id === id && !w.archivedAt);
}
function createBackgroundWorkspace(prefix, cli, cwd) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    for (const k of ["PASEO_AGENT_ID", "PASEO_WORKSPACE_ID"]) delete env[k];
    const c = spawn(process.execPath, [...prefix, cli, "workspace", "create", "--isolation", "local",
      "--path", cwd, "--title", "Paseo 봇 에이전트", "--background", "--json"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { c.kill(); reject(Error("workspace")); }, 30000);
    c.stdout.on("data", (b) => { out += b; if (out.length > 200000) c.kill(); });
    c.stderr.resume();
    c.on("error", () => { clearTimeout(timer); reject(Error("workspace")); });
    c.on("close", (code) => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        const id = (r.data || r).workspaceId;
        if (code || typeof id !== "string" || !id) throw Error();
        resolve(id);
      } catch {
        reject(Error("workspace"));
      }
    });
  });
}
// Refused before any effect on the manager: the caller knows nothing was sent and may retry.
// Every other failure keeps meaning "outcome unknown, never resend automatically".
class Refused extends Error {}
// Paseo collects the runtime of an agent that stayed idle for about an hour: it turns
// "closed" but keeps its history and resumes from persistence. Neither state has a turn in flight.
const RESTING = new Set(["idle", "closed"]);
async function owned() {
  const current = await client.fetchAgent({
    agentId: req.agentId,
    timeout: 10000,
  });
  if (
    !current?.agent ||
    current.agent.archivedAt ||
    current.agent.labels?.paseo_bot_gui !== req.session
  )
    throw new Refused("ownership");
  return current;
}
// An action that needs a live runtime reloads a collected one first. Archived agents never get
// here (owned() refused them), so the refresh cannot unarchive anything.
async function ready(current) {
  if (current.agent.status === "closed") {
    await client.refreshAgent(req.agentId);
    current = await owned();
  }
  if (current.agent.status !== "idle") throw new Refused("busy");
  return current;
}
async function main() {
  const module = process.env.PASEO_MULTI_HOST_CLIENT_MODULE;
  if (!client) {
    const { connectToDaemon } = await import(pathToFileURL(module).href);
    client = await connectToDaemon({
      target: {
        kind: "instance",
        home: process.env.PASEO_HOME || path.join(os.homedir(), ".paseo"),
      },
      timeout: 10000,
    });
    verifiedServer = "";
  }
  // Identity is checked on every new connection and whenever the requested server changes.
  if (verifiedServer !== req.serverId) {
    const status = await client.getDaemonStatus({ timeout: 10000 });
    if (status.serverId !== req.serverId) throw Error("identity");
    verifiedServer = req.serverId;
  }
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
    // The manager only plans and explains. Codex "auto" is the documented mode:
    // workspace-write with approvals, and the bot denies every request.
    const mode = req.mode || "auto";
    if (
      !p?.enabled ||
      p.status !== "ready" ||
      !p.modes?.some((m) => m.id === mode)
    )
      throw Error("provider");
    // Managers share one workspace instead of adding a sidebar entry per
    // conversation. A remembered workspace that is gone falls back to one new one.
    let reuse = req.workspaceId && (await workspaceExists(req.workspaceId));
    const cli = path.join(path.dirname(path.dirname(module)), "index.js");
    const prefix = JSON.parse(process.env.PASEO_BOT_RUNTIME_PREFIX || "[]");
    if (!reuse) {
      // One background workspace hosts every manager and the memory curator: it stays out of
      // the Paseo sidebar instead of appearing under whatever project owns req.cwd.
      const made = await createBackgroundWorkspace(prefix, cli, req.cwd).catch(() => null);
      if (made) {
        req.workspaceId = made;
        reuse = true;
      }
    }
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
      ...(reuse
        ? ["--workspace", req.workspaceId]
        : ["--cwd", req.cwd, "--new-workspace", "local"]),
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
          resolve(d.agentId);
        } catch {
          reject(Error("receipt"));
        }
      });
    }).then(async (id) => {
      // The agent exists now; a failed lookup only skips remembering the workspace.
      const created = await client
        .fetchAgent({ agentId: id, timeout: 10000 })
        .catch(() => null);
      return { id, workspaceId: created?.agent?.workspaceId || null };
    });
  }
  let current = await owned();
  if (req.action === "permits") {
    const pending = Array.isArray(current.agent.pendingPermissions)
      ? current.agent.pendingPermissions
      : [];
    return pending.slice(0, 20).map((p) => ({
      id: String(p?.id ?? "").slice(0, 200),
      name: String(p?.name ?? "").slice(0, 200),
      description: String(p?.description ?? "").slice(0, 1000),
    })).filter((p) => p.id);
  }
  if (req.action === "permit") {
    if (
      typeof req.requestId !== "string" ||
      !req.requestId ||
      !["allow", "deny"].includes(req.decision)
    )
      throw Error("action");
    const pending = Array.isArray(current.agent.pendingPermissions)
      ? current.agent.pendingPermissions
      : [];
    if (!pending.some((p) => p?.id === req.requestId)) throw Error("permission");
    await client.respondToPermission(req.agentId, req.requestId, {
      behavior: req.decision,
    });
    return { result: req.decision };
  }
  if (req.action === "archive") {
    // Only a manager with no turn in flight is archived. A collected runtime ("closed") has none.
    if (!RESTING.has(current.agent.status)) throw new Refused("busy");
    await client.archiveAgent(req.agentId);
    return { archived: true };
  }
  if (req.action === "tune") {
    // Per-turn tier switch (chat model ↔ planner model) on the same conversation.
    if (typeof req.model !== "string" || !req.model || typeof req.thinking !== "string" || !req.thinking)
      throw new Refused("action");
    current = await ready(current);
    await client.setAgentModel(req.agentId, req.model);
    await client.setAgentThinkingOption(req.agentId, req.thinking);
    return { tuned: true };
  }
  if (req.action === "claim") {
    // A pre-created spare becomes this conversation's manager by relabelling.
    if (typeof req.to !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(req.to)) throw new Refused("action");
    current = await ready(current);
    await client.updateAgent(req.agentId, { labels: { paseo_bot_gui: req.to } });
    return { claimed: true };
  }
  if (req.action === "send") {
    current = await ready(current);
    await client.sendMessage(req.agentId, req.prompt);
    return { accepted: true };
  }
  if (req.action === "observe") {
    const r = await client.waitForFinish(req.agentId, 1000);
    // The pending count lets the caller skip a separate permits round trip.
    let pendingPermissions = null;
    try {
      const current = await client.fetchAgent({ agentId: req.agentId, timeout: 10000 });
      if (Array.isArray(current?.agent?.pendingPermissions))
        pendingPermissions = Math.min(current.agent.pendingPermissions.length, 20);
    } catch {
      pendingPermissions = null;
    }
    return { status: r.status, message: r.lastMessage || "", pendingPermissions };
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
const FAILED = '{"ok":false,"error":"Manager transport unavailable; outcome may be unknown."}';
const refusal = (error) => JSON.stringify({ ok: false, refused: error.message });
if (!SERVE) {
  try {
    process.stdout.write(JSON.stringify({ ok: true, result: await main() }));
  } catch (error) {
    process.stdout.write(error instanceof Refused ? refusal(error) : FAILED);
    process.exitCode = 1;
  } finally {
    await client?.close().catch(() => {});
  }
} else {
  const readline = await import("node:readline");
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let out;
    try {
      req = JSON.parse(line);
      out = JSON.stringify({ ok: true, result: await main() });
    } catch (error) {
      if (error instanceof Refused) {
        // The connection answered; only the request was refused.
        process.stdout.write(refusal(error) + "\n");
        continue;
      }
      out = FAILED;
      // A failed call may mean a dead connection: reconnect (and re-verify identity) next time.
      await client?.close().catch(() => {});
      client = null;
      verifiedServer = "";
    }
    process.stdout.write(out + "\n");
  }
  await client?.close().catch(() => {});
}
