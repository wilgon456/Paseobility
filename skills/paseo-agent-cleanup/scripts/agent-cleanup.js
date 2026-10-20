#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ACTIVE_STATUS_PATTERN = /(^|[\s_-])(running|initializing|working|active|starting|queued|pending|busy|executing|in[\s_-]?progress)([\s_-]|$)/i;
const INACTIVE_STATUSES = new Set(["idle", "error", "closed"]);
const DISPOSABLE_MARKER_PATTERN = /(^|[\s/_.-])(disposable|fixture|fixtures|smoke|temp|temporary|test|tests|testing|validation|validate|verification|verify)([\s/_.-]|$)/i;

function usage() {
  console.log(`Usage:
  agent-cleanup.js
  agent-cleanup.js --dry-run [--pattern <regex>] [--include-workspaces]
  agent-cleanup.js --auto [--pattern <regex> | --agent <id>]
  agent-cleanup.js --agent <id> [--agent <id>] --archive
  agent-cleanup.js --pattern <regex> --archive
  agent-cleanup.js --workspace <id> [--workspace <id>] --archive --yes

Options:
  --auto                 Archive inactive agents selected by an explicit ID,
                         a user pattern, or a disposable/test marker.
  --dry-run              Show candidates without changing state. This is the default.
  --archive              Archive selected candidates (agent archive is a soft delete).
  --yes                  Required for workspace archive, which can remove a managed worktree.
  --pattern <regex>      Select inactive agents by a user-supplied regex.
  --agent <id>           Explicit agent ID to consider.
  --workspace <id>       Explicit workspace ID to consider.
  --include-workspaces   Preview marked or pattern-matched workspaces in dry-run mode.
  --json                 Output a machine-readable JSON summary.
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: true,
    archive: false,
    auto: false,
    yes: false,
    pattern: null,
    patternProvided: false,
    agentIds: [],
    workspaceIds: [],
    includeWorkspaces: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      opts.dryRun = true;
      opts.archive = false;
      opts.auto = false;
    } else if (arg === "--auto") {
      opts.dryRun = false;
      opts.archive = true;
      opts.auto = true;
    } else if (arg === "--archive") {
      opts.archive = true;
      opts.dryRun = false;
      opts.auto = false;
    } else if (arg === "--yes") {
      opts.yes = true;
    } else if (arg === "--pattern") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("--pattern requires a non-empty value");
      }
      opts.pattern = argv[++i];
      opts.patternProvided = true;
    } else if (arg === "--agent") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("--agent requires an ID");
      }
      opts.agentIds.push(argv[++i]);
    } else if (arg === "--workspace") {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) {
        throw new Error("--workspace requires an ID");
      }
      opts.workspaceIds.push(argv[++i]);
    } else if (arg === "--include-workspaces") {
      opts.includeWorkspaces = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (opts.patternProvided && !opts.pattern) {
    throw new Error("--pattern requires a non-empty value");
  }
  if (opts.auto && (opts.workspaceIds.length || opts.includeWorkspaces)) {
    throw new Error("--auto never archives workspaces; use explicit --workspace <id> --archive --yes");
  }
  if (opts.archive && opts.workspaceIds.length && !opts.yes) {
    throw new Error("workspace --archive requires --yes");
  }
  if (
    opts.archive &&
    !opts.auto &&
    !opts.agentIds.length &&
    !opts.workspaceIds.length &&
    !opts.patternProvided
  ) {
    throw new Error("--archive requires --agent, --workspace, or a user-supplied --pattern");
  }
  if (opts.archive && opts.includeWorkspaces) {
    throw new Error("--include-workspaces is preview-only; archive workspaces by explicit ID");
  }

  return opts;
}

function snapshotRuntime() {
  const customModule = process.env.PASEO_CLEANUP_CLIENT_MODULE;
  const customNode = process.env.PASEO_CLEANUP_NODE;
  if (customModule || customNode) {
    if (!customModule || !customNode || !fs.existsSync(customModule) || !fs.existsSync(customNode)) {
      throw new Error("Set both PASEO_CLEANUP_CLIENT_MODULE and PASEO_CLEANUP_NODE to installed files");
    }
    return {command: customNode, args: [], module: customModule};
  }
  const resources = process.platform === "win32"
    ? [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs/Paseo/resources"),
       process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Paseo/resources")].filter(Boolean)
    : ["/Applications/Paseo.app/Contents/Resources"];
  for (const root of resources) {
    const command = process.platform === "win32" ? path.join(root, "..", "Paseo.exe")
      : path.join(root, "..", "Frameworks/Paseo Helper.app/Contents/MacOS/Paseo Helper");
    const runner = path.join(root, "app.asar.unpacked/dist/daemon/node-entrypoint-runner.js");
    if (fs.existsSync(path.join(root, "app.asar")) && fs.existsSync(command) && fs.existsSync(runner)) {
      return {command, args: ["--disable-warning=DEP0040", runner, "node-script"],
        module: path.join(root, "app.asar/node_modules/@getpaseo/cli/dist/utils/client.js")};
    }
  }
  // Standalone npm CLI installs expose the same client next to dist/index.js.
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const executable = path.join(dir, process.platform === "win32" ? "paseo.cmd" : "paseo");
    if (!fs.existsSync(executable)) continue;
    let parent = path.dirname(fs.realpathSync(executable));
    for (let depth = 0; depth < 5; depth++, parent = path.dirname(parent)) {
      const module = path.join(parent, "dist/utils/client.js");
      if (fs.existsSync(module)) return {command: process.execPath, args: [], module};
    }
  }
  throw new Error("Installed Paseo client runtime not found; cleanup requires complete snapshots");
}

function run(command, args, serverId) {
  if (command === "snapshot" || command === "paseo") {
    let request = {action: "snapshot"};
    if (command === "paseo") {
      const agent = args.length === 3 && args[0] === "archive" && args[2] === "--json";
      const workspace = args.length === 4 && args[0] === "workspace" && args[1] === "archive" && args[3] === "--json";
      if (!agent && !workspace) throw new Error("Only exact-ID archive requests are supported");
      request = {action: "archive", kind: agent ? "agent" : "workspace", id: args[agent ? 1 : 2], serverId};
    }
    const runtime = snapshotRuntime();
    const result = spawnSync(runtime.command, [...runtime.args, path.join(__dirname, "snapshot.mjs")], {
      encoding: "utf8", timeout: 45000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
      env: {...process.env, ELECTRON_RUN_AS_NODE: "1", PASEO_CLEANUP_CLIENT_MODULE: runtime.module},
      input: JSON.stringify(request), windowsHide: true,
    });
    return {status: result.status ?? 1, stdout: result.stdout || "", stderr: result.error
      ? "Guarded request timed out or unavailable; outcome unknown, inspect fresh state before retrying"
      : result.status ? "Guarded request failed; inspect fresh state before retrying" : ""};
  }
  throw new Error("Unsupported cleanup operation");
}

function readSnapshot(runCommand, expectedServer) {
  const result = runCommand("snapshot", []);
  if (result.status !== 0) throw new Error("Complete Paseo snapshot unavailable; no further cleanup attempted");
  const value = JSON.parse(result.stdout);
  if (value.complete !== true || typeof value.serverId !== "string" || !value.serverId ||
      !Array.isArray(value.agents) || !Array.isArray(value.workspaces) ||
      (expectedServer && value.serverId !== expectedServer)) throw new Error("Incomplete snapshot or daemon identity changed");
  for (const [rows, key] of [[value.agents, "id"], [value.workspaces, "workspaceId"]]) {
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row[key] !== "string" || !/^[a-zA-Z0-9_-]+$/.test(row[key]) || ids.has(row[key]))
        throw new Error("Invalid or duplicate record in Paseo snapshot");
      ids.add(row[key]);
    }
  }
  return value;
}

function searchableValue(item) {
  return [
    item.id,
    item.shortId,
    item.name,
    item.title,
    item.provider,
    item.status,
    item.cwd,
    item.created,
    item.workspaceId,
    item.project,
    item.isolation,
  ]
    .filter(Boolean)
    .join(" ");
}

function disposableValue(item) {
  return [item.name, item.title, item.cwd, item.project, item.isolation]
    .filter(Boolean)
    .join(" ");
}

function isActive(agent) {
  return ACTIVE_STATUS_PATTERN.test(String(agent.status || ""));
}

function protectionReason(agent) {
  if (!INACTIVE_STATUSES.has(agent.status)) return "active or unknown agent state";
  if (!Number.isInteger(agent.pendingPermissionCount) || agent.pendingPermissionCount < 0)
    return "permission state unknown";
  if (agent.pendingPermissionCount > 0 || agent.attentionReason === "permission") return "permission pending";
  if (agent.requiresAttention && agent.attentionReason !== "finished") return "attention required";
  return "";
}

function matchesId(item, requestedId, kind = "agent") {
  const values = kind === "workspace"
    ? [item.workspaceId, item.id]
    : [item.id, item.shortId];
  return values.filter(Boolean).includes(requestedId);
}

function selectAgents(agents, opts, regex) {
  return agents.map((agent) => {
    const explicit = opts.agentIds.some((id) => matchesId(agent, id));
    const patternMatch = Boolean(regex && regex.test(searchableValue(agent)));
    const disposableMarker = DISPOSABLE_MARKER_PATTERN.test(disposableValue(agent));
    let requested = false;
    let selectionSource = "none";

    if (opts.agentIds.length) {
      requested = explicit;
      if (requested) selectionSource = "explicit-agent";
    } else if (opts.patternProvided) {
      requested = patternMatch;
      if (requested) selectionSource = "user-pattern";
    } else if (!opts.workspaceIds.length) {
      requested = disposableMarker;
      if (requested) selectionSource = "disposable-marker";
    }

    const protection = protectionReason(agent);
    let skippedReason = "";
    if (protection) skippedReason = protection;
    else if (!requested && !opts.agentIds.length && !opts.patternProvided) {
      skippedReason = "inactive but not marked disposable; idle alone is preserved";
    } else if (!requested) skippedReason = "not selected";

    return {
      item: agent,
      explicit,
      patternMatch,
      disposableMarker,
      selectionSource,
      selected: requested && !protection,
      skippedReason,
    };
  });
}

function selectWorkspaces(workspaces, opts, regex) {
  return workspaces.map((workspace) => {
    const explicit = opts.workspaceIds.some((id) => matchesId(workspace, id, "workspace"));
    const patternMatch = Boolean(regex && regex.test(searchableValue(workspace)));
    const disposableMarker = DISPOSABLE_MARKER_PATTERN.test(disposableValue(workspace));
    const previewMatch = opts.patternProvided ? patternMatch : disposableMarker;
    const selected = explicit || (opts.dryRun && opts.includeWorkspaces && previewMatch);
    return {
      item: workspace,
      explicit,
      patternMatch,
      disposableMarker,
      selectionSource: explicit ? "explicit-workspace" : selected ? (opts.patternProvided ? "user-pattern" : "disposable-marker") : "none",
      selected,
      skippedReason: selected ? "" : "workspace archive requires an explicit ID and --archive --yes",
    };
  });
}

function archiveAcknowledgement(stdout, expectedId, kind) {
  try {
    const payload = JSON.parse(String(stdout || "").trim());
    const idKey = kind === "workspace" ? "workspaceId" : "agentId";
    return payload?.status === "archived" && payload?.[idKey] === expectedId &&
      typeof payload.archivedAt === "string" && Number.isFinite(Date.parse(payload.archivedAt));
  } catch (_error) {
    return false;
  }
}

function requestedIdsMissing(items, requestedIds, kind) {
  return requestedIds.filter((id) => !items.some((item) => matchesId(item, id, kind)));
}

function stillListed(items, original, kind) {
  const key = kind === "workspace" ? "workspaceId" : "id";
  return items.some(item => item[key] === original[key]);
}

function execute(opts, runCommand = run) {
  const regex = opts.patternProvided ? new RegExp(opts.pattern, "i") : null;
  const initial = readSnapshot(runCommand);
  const {agents, workspaces} = initial;
  const agentRows = selectAgents(agents, opts, regex);
  const workspaceRows = selectWorkspaces(workspaces, opts, regex);
  const selectedAgents = agentRows.filter((row) => row.selected);
  const selectedWorkspaces = opts.archive
    ? workspaceRows.filter((row) => row.explicit)
    : workspaceRows.filter((row) => row.selected);

  const validationErrors = [];
  const missingAgentIds = requestedIdsMissing(agents, opts.agentIds, "agent");
  const missingWorkspaceIds = requestedIdsMissing(workspaces, opts.workspaceIds, "workspace");
  if (missingAgentIds.length) validationErrors.push(`agent IDs not found: ${missingAgentIds.join(", ")}`);
  if (missingWorkspaceIds.length) validationErrors.push(`workspace IDs not found: ${missingWorkspaceIds.join(", ")}`);
  for (const id of opts.agentIds) {
    if (agents.filter(agent => matchesId(agent, id)).length > 1)
      validationErrors.push(`ambiguous agent ID: ${id}; use a full ID`);
  }

  const summary = {
    status: opts.dryRun ? "dry-run" : "pending",
    mode: opts.dryRun ? "dry-run" : opts.auto ? "auto-archive" : "archive",
    candidatePolicy: opts.agentIds.length
      ? "explicit-agent"
      : opts.patternProvided
        ? "user-pattern"
        : "disposable-markers-only",
    pattern: opts.patternProvided ? opts.pattern : null,
    agentsConsidered: agents.length,
    agentsSelected: selectedAgents.map((row) => row.item.id),
    workspacesConsidered: workspaces.length,
    workspacesSelected: selectedWorkspaces.map((row) => row.item.workspaceId),
    validationErrors,
    actions: [],
    verification: {
      agentListRechecked: false,
      workspaceListRechecked: false,
      historyOrResumeUsed: false,
      completeSnapshots: true,
      preArchiveRechecks: 0,
    },
  };

  if (opts.dryRun) {
    return { summary, agentRows, workspaceRows, exitCode: 0 };
  }
  if (validationErrors.length) {
    summary.status = "failed";
    return { summary, agentRows, workspaceRows, exitCode: 1 };
  }

  let halt = false;
  function attempt(kind, row) {
    const id = kind === "agent" ? row.item.id : row.item.workspaceId;
    let fresh;
    try {
      fresh = readSnapshot(runCommand, initial.serverId);
      summary.verification.preArchiveRechecks++;
    } catch (error) {
      summary.actions.push({type: kind, id, commandExitCode: null, archiveAcknowledged: false,
        paseoRecordRemoved: null, outcome: "precheck-failed", reason: error.message});
      halt = true;
      return;
    }
    let reason = "";
    if (kind === "agent") {
      const current = fresh.agents.find(agent => agent.id === id);
      reason = current ? protectionReason(current) : "agent no longer present";
      if (current && !reason && !selectAgents([current], opts, regex)[0].selected)
        reason = "selection no longer matches fresh state";
    } else {
      const unknownOwnership = fresh.agents.some(agent => typeof agent.workspaceId !== "string" || !agent.workspaceId);
      const blocked = fresh.agents.some(agent => agent.workspaceId === id && protectionReason(agent));
      reason = !fresh.workspaces.some(workspace => workspace.workspaceId === id) ? "workspace no longer present"
        : unknownOwnership ? "agent ownership unknown"
        : blocked ? "workspace contains active/unknown/attention-required agents" : "";
    }
    if (reason) {
      summary.actions.push({type: kind, id, commandExitCode: null, archiveAcknowledged: false,
        paseoRecordRemoved: false, outcome: "protected", reason});
      return;
    }
    const args = kind === "agent" ? ["archive", id, "--json"] : ["workspace", "archive", id, "--json"];
    const result = runCommand("paseo", args, initial.serverId);
    const action = {type: kind, id, commandExitCode: result.status,
      archiveAcknowledged: result.status === 0 && archiveAcknowledgement(result.stdout, id, kind),
      paseoRecordRemoved: null, outcome: "pending-verification", stdout: result.stdout, stderr: result.stderr};
    summary.actions.push(action);
    try {
      const after = readSnapshot(runCommand, initial.serverId);
      if (kind === "agent") {
        summary.verification.agentListRechecked = true;
        action.paseoRecordRemoved = !stillListed(after.agents, row.item, "agent");
      } else {
        summary.verification.workspaceListRechecked = true;
        action.paseoRecordRemoved = !stillListed(after.workspaces, row.item, "workspace") &&
          !after.agents.some(agent => agent.workspaceId === id);
      }
    } catch (error) {
      summary.verification[kind + "ListError"] = error.message;
      halt = true;
    }
    action.outcome = result.status !== 0 ? "archive-command-failed"
      : !action.archiveAcknowledged ? "archive-response-invalid"
      : action.paseoRecordRemoved !== true ? "verification-failed" : "success";
    if (action.outcome !== "success") halt = true;
  }
  for (const row of selectedAgents) {
    attempt("agent", row);
    if (halt) break;
  }
  if (!halt) for (const row of selectedWorkspaces) {
    attempt("workspace", row);
    if (halt) break;
  }

  if (!summary.actions.length) {
    summary.status = "no-op";
    return { summary, agentRows, workspaceRows, exitCode: 0 };
  }

  const failed = summary.actions.filter((action) => action.outcome !== "success");
  if (!failed.length) {
    summary.status = "success";
    return { summary, agentRows, workspaceRows, exitCode: 0 };
  }
  const anyEffectVerified = summary.actions.some((action) => action.paseoRecordRemoved === true);
  summary.status = anyEffectVerified ? "partial-failure" : "failed";
  return { summary, agentRows, workspaceRows, exitCode: 1 };
}

function printTable(title, rows, kind) {
  console.log(`\n## ${title}`);
  if (!rows.length) {
    console.log("- none");
    return;
  }
  for (const row of rows) {
    const item = row.item;
    const id = kind === "workspace" ? item.workspaceId : item.id;
    const label = item.name || item.project || item.cwd || "";
    const status = item.status ? ` status=${item.status}` : "";
    const selected = row.selected ? "SELECTED" : "skipped";
    const source = row.selectionSource !== "none" ? ` source=${row.selectionSource}` : "";
    const reason = row.skippedReason ? ` (${row.skippedReason})` : "";
    console.log(`- ${selected}: ${id}${status}${source} ${label}${reason}`);
  }
}

function printHuman(result) {
  const { summary, agentRows, workspaceRows } = result;
  console.log("# Paseo Agent Cleanup");
  console.log(`\nmode: ${summary.mode}`);
  console.log(`candidate policy: ${summary.candidatePolicy}`);
  if (summary.pattern) console.log(`pattern: ${summary.pattern}`);
  printTable("Agents", agentRows, "agent");
  printTable("Workspaces", workspaceRows, "workspace");

  if (summary.mode === "dry-run") {
    console.log("\n[dry-run] No changes made. Ordinary idle agents are preserved.");
    return;
  }

  console.log("\n## Actions");
  if (!summary.actions.length) console.log("- none");
  for (const action of summary.actions) {
    console.log(
      `- ${action.type} ${action.id}: outcome=${action.outcome} exit=${action.commandExitCode} ` +
      `archiveAcknowledged=${action.archiveAcknowledged} paseoRecordRemoved=${action.paseoRecordRemoved}`
    );
    if (action.stderr) console.log(`  stderr: ${action.stderr.trim()}`);
    if (action.reason) console.log(`  reason: ${action.reason}`);
  }
  for (const error of summary.validationErrors) console.log(`- validation failure: ${error}`);
  if (summary.verification.agentListError) console.log(`- agent verification failure: ${summary.verification.agentListError}`);
  if (summary.verification.workspaceListError) console.log(`- workspace verification failure: ${summary.verification.workspaceListError}`);
  console.log(`\nresult: ${summary.status}`);
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    usage();
    return 0;
  }
  const result = execute(opts);
  if (opts.json) {
    const payload = opts.dryRun
      ? { ...result.summary, agentRows: result.agentRows, workspaceRows: result.workspaceRows }
      : result.summary;
    console.log(JSON.stringify(payload, null, 2));
  }
  else printHuman(result);
  return result.exitCode;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({ status: "failed", error: error.message }, null, 2));
    } else {
      console.error(`error: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

module.exports = {
  ACTIVE_STATUS_PATTERN,
  DISPOSABLE_MARKER_PATTERN,
  archiveAcknowledgement,
  execute,
  isActive,
  parseArgs,
  printHuman,
  selectAgents,
  selectWorkspaces,
  protectionReason,
  readSnapshot,
};
