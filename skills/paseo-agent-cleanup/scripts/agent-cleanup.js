#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");

const ACTIVE_STATUS_PATTERN = /(^|[\s_-])(running|working|active|starting|queued|pending|busy|executing|in[\s_-]?progress)([\s_-]|$)/i;
const DISPOSABLE_MARKER_PATTERN = /(^|[\s/_.-])(disposable|fixture|fixtures|smoke|temp|temporary|test|tests|testing|validation|validate|verification|verify)([\s/_.-]|$)/i;

function usage() {
  console.log(`Usage:
  agent-cleanup.js
  agent-cleanup.js --dry-run [--pattern <regex>] [--include-workspaces]
  agent-cleanup.js --auto [--pattern <regex> | --agent <id>]
  agent-cleanup.js --agent <id> [--agent <id>] --archive --yes
  agent-cleanup.js --workspace <id> [--workspace <id>] --archive --yes

Options:
  --auto                 Archive inactive agents selected by an explicit ID,
                         a user pattern, or a disposable/test marker.
  --dry-run              Show candidates without changing state. This is the default.
  --archive              Archive selected candidates. Requires --yes.
  --yes                  Confirm explicit archive execution.
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
  if (opts.archive && !opts.auto && !opts.yes) {
    throw new Error("--archive requires --yes");
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

function run(command, args) {
  const useCmd = process.platform === "win32" && command === "paseo";
  const spawnCommand = useCmd ? "cmd.exe" : command;
  const spawnArgs = useCmd ? ["/d", "/s", "/c", command, ...args] : args;
  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return {
    status: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || (result.error ? result.error.message : ""),
  };
}

function parseListingResult(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr || result.stdout}`.trim());
  }
  const text = result.stdout.trim();
  if (!text) return [];
  const value = JSON.parse(text);
  if (Array.isArray(value)) return value;
  const key = label.includes("workspace") ? "workspaces" : "agents";
  if (value && Array.isArray(value[key])) return value[key];
  throw new Error(`${label} returned JSON without an array`);
}

function listAgents(runCommand) {
  return parseListingResult(runCommand("paseo", ["ls", "--json"]), "paseo ls --json");
}

function listWorkspaces(runCommand) {
  return parseListingResult(
    runCommand("paseo", ["workspace", "ls", "--json"]),
    "paseo workspace ls --json"
  );
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
    } else {
      requested = disposableMarker;
      if (requested) selectionSource = "disposable-marker";
    }

    const active = isActive(agent);
    let skippedReason = "";
    if (active) skippedReason = "active agents are never archived by this helper";
    else if (!requested && !opts.agentIds.length && !opts.patternProvided) {
      skippedReason = "inactive but not marked disposable; idle alone is preserved";
    } else if (!requested) skippedReason = "not selected";

    return {
      item: agent,
      explicit,
      patternMatch,
      disposableMarker,
      selectionSource,
      selected: requested && !active,
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

function findProviderReleaseValue(value) {
  if (!value || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (["providerRelease", "provider_release", "nativeProviderRelease", "native_provider_release"].includes(key)) {
      return nested;
    }
  }
  for (const nested of Object.values(value)) {
    const found = findProviderReleaseValue(nested);
    if (found !== undefined) return found;
  }
  return undefined;
}

function providerReleaseFromOutput(stdout) {
  let payload;
  try {
    payload = JSON.parse(String(stdout || "").trim());
  } catch (_error) {
    return "unknown";
  }
  const value = findProviderReleaseValue(payload);
  if (value === true || /^(confirmed|released|success|succeeded)$/i.test(String(value || ""))) {
    return "confirmed";
  }
  if (value === false || /^(failed|error|not[-_ ]?released)$/i.test(String(value || ""))) {
    return "failed";
  }
  return "unknown";
}

function requestedIdsMissing(items, requestedIds, kind) {
  return requestedIds.filter((id) => !items.some((item) => matchesId(item, id, kind)));
}

function stillListed(items, original, kind) {
  const ids = kind === "workspace"
    ? [original.workspaceId, original.id]
    : [original.id, original.shortId];
  return items.some((item) => ids.filter(Boolean).some((id) => matchesId(item, id, kind)));
}

function execute(opts, runCommand = run) {
  const regex = opts.patternProvided ? new RegExp(opts.pattern, "i") : null;
  const agents = listAgents(runCommand);
  const workspaces = listWorkspaces(runCommand);
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
    },
  };

  if (opts.dryRun) {
    return { summary, agentRows, workspaceRows, exitCode: 0 };
  }
  if (validationErrors.length) {
    summary.status = "failed";
    return { summary, agentRows, workspaceRows, exitCode: 1 };
  }

  for (const row of selectedAgents) {
    const id = row.item.id;
    const result = runCommand("paseo", ["archive", id, "--json"]);
    summary.actions.push({
      type: "agent",
      id,
      commandExitCode: result.status,
      paseoRecordRemoved: null,
      providerRelease: providerReleaseFromOutput(result.stdout),
      outcome: result.status === 0 ? "pending-verification" : "archive-command-failed",
      stdout: result.stdout,
      stderr: result.stderr,
      _item: row.item,
    });
  }

  for (const row of selectedWorkspaces) {
    const id = row.item.workspaceId;
    const result = runCommand("paseo", ["workspace", "archive", id, "--json"]);
    summary.actions.push({
      type: "workspace",
      id,
      commandExitCode: result.status,
      paseoRecordRemoved: null,
      outcome: result.status === 0 ? "pending-verification" : "archive-command-failed",
      stdout: result.stdout,
      stderr: result.stderr,
      _item: row.item,
    });
  }

  const agentActions = summary.actions.filter((action) => action.type === "agent");
  if (agentActions.length) {
    try {
      const remainingAgents = listAgents(runCommand);
      summary.verification.agentListRechecked = true;
      for (const action of agentActions) {
        action.paseoRecordRemoved = !stillListed(remainingAgents, action._item, "agent");
      }
    } catch (error) {
      summary.verification.agentListError = error.message;
    }
  }

  const workspaceActions = summary.actions.filter((action) => action.type === "workspace");
  if (workspaceActions.length) {
    try {
      const remainingWorkspaces = listWorkspaces(runCommand);
      summary.verification.workspaceListRechecked = true;
      for (const action of workspaceActions) {
        action.paseoRecordRemoved = !stillListed(remainingWorkspaces, action._item, "workspace");
      }
    } catch (error) {
      summary.verification.workspaceListError = error.message;
    }
  }

  for (const action of summary.actions) {
    if (action.commandExitCode !== 0) {
      action.outcome = "archive-command-failed";
    } else if (action.paseoRecordRemoved !== true) {
      action.outcome = "verification-failed";
    } else if (action.type === "agent" && action.providerRelease !== "confirmed") {
      action.outcome = action.providerRelease === "failed" ? "provider-release-failed" : "provider-release-unknown";
    } else {
      action.outcome = "success";
    }
    delete action._item;
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
    const provider = action.type === "agent" ? ` providerRelease=${action.providerRelease}` : "";
    console.log(
      `- ${action.type} ${action.id}: outcome=${action.outcome} exit=${action.commandExitCode} ` +
      `paseoRecordRemoved=${action.paseoRecordRemoved}${provider}`
    );
    if (action.stderr) console.log(`  stderr: ${action.stderr.trim()}`);
  }
  for (const error of summary.validationErrors) console.log(`- validation failure: ${error}`);
  if (summary.verification.agentListError) console.log(`- agent verification failure: ${summary.verification.agentListError}`);
  if (summary.verification.workspaceListError) console.log(`- workspace verification failure: ${summary.verification.workspaceListError}`);
  console.log(`\nresult: ${summary.status}`);
  if (summary.actions.some((action) => action.providerRelease === "unknown")) {
    console.log("warning: Paseo record removal was checked, but native provider release could not be confirmed.");
  }
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
  execute,
  isActive,
  parseArgs,
  printHuman,
  providerReleaseFromOutput,
  selectAgents,
  selectWorkspaces,
};
