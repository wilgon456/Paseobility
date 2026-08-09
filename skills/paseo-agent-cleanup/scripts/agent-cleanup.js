#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const DEFAULT_PATTERN = "test|verify|validation|retest|recognition|paseobility|\\bpr\\b|pr[-_ ]?\\d+";

function usage() {
  console.log(`Usage:
  agent-cleanup.js [--auto] [--pattern <regex>]
  agent-cleanup.js --dry-run [--pattern <regex>] [--include-workspaces]
  agent-cleanup.js --agent <id> [--agent <id>] --archive --yes
  agent-cleanup.js --workspace <id> [--workspace <id>] --archive --yes

Options:
  --auto                 Archive safe non-running agent candidates. This is the default.
  --dry-run              Show candidates without changing state.
  --archive              Archive selected candidates. Requires --yes.
  --yes                  Confirm archive execution.
  --pattern <regex>      Candidate regex for names/titles/cwd/provider/id.
  --agent <id>           Explicit agent ID to consider.
  --workspace <id>       Explicit workspace ID to consider.
  --include-workspaces   Also select workspace candidates by pattern.
  --json                 Output machine-readable JSON summary.
`);
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    archive: true,
    auto: true,
    yes: false,
    pattern: DEFAULT_PATTERN,
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
    }
    else if (arg === "--archive") {
      opts.archive = true;
      opts.dryRun = false;
      opts.auto = false;
    } else if (arg === "--yes") opts.yes = true;
    else if (arg === "--pattern") opts.pattern = argv[++i] || "";
    else if (arg === "--agent") opts.agentIds.push(argv[++i] || "");
    else if (arg === "--workspace") opts.workspaceIds.push(argv[++i] || "");
    else if (arg === "--include-workspaces") opts.includeWorkspaces = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  opts.agentIds = opts.agentIds.filter(Boolean);
  opts.workspaceIds = opts.workspaceIds.filter(Boolean);
  if (!opts.pattern) throw new Error("--pattern cannot be empty");
  return opts;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function parseJsonCommand(command, args) {
  const result = run(command, args);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  const text = result.stdout.trim();
  if (!text) return [];
  return JSON.parse(text);
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

function isRunning(agent) {
  return String(agent.status || "").toLowerCase().includes("running");
}

function selectAgents(agents, opts, regex) {
  return agents.map((agent) => {
    const explicit = opts.agentIds.includes(agent.id) || opts.agentIds.includes(agent.shortId);
    const patternMatch = regex.test(searchableValue(agent));
    const selected = explicit || (!opts.agentIds.length && patternMatch);
    const skippedReason = isRunning(agent)
      ? "running agents are never archived by this helper"
      : selected
        ? ""
        : "not selected";
    return { item: agent, explicit, patternMatch, selected: selected && !isRunning(agent), skippedReason };
  });
}

function selectWorkspaces(workspaces, opts, regex) {
  return workspaces.map((workspace) => {
    const explicit = opts.workspaceIds.includes(workspace.workspaceId);
    const patternMatch = regex.test(searchableValue(workspace));
    const selected = explicit || (opts.includeWorkspaces && !opts.workspaceIds.length && patternMatch);
    return {
      item: workspace,
      explicit,
      patternMatch,
      selected,
      skippedReason: selected ? "" : "not selected",
    };
  });
}

function archiveAgent(id) {
  return run("paseo", ["archive", id, "--json"]);
}

function archiveWorkspace(id) {
  return run("paseo", ["workspace", "archive", id, "--json"]);
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
    const reason = row.skippedReason ? ` (${row.skippedReason})` : "";
    console.log(`- ${selected}: ${id}${status} ${label}${reason}`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const regex = new RegExp(opts.pattern, "i");
  const agents = parseJsonCommand("paseo", ["ls", "--json"]);
  const workspaces = parseJsonCommand("paseo", ["workspace", "ls", "--json"]);

  const agentRows = selectAgents(agents, opts, regex);
  const workspaceRows = selectWorkspaces(workspaces, opts, regex);
  const selectedAgents = agentRows.filter((row) => row.selected);
  const selectedWorkspaces = opts.auto ? [] : workspaceRows.filter((row) => row.selected);

  const summary = {
    mode: opts.dryRun ? "dry-run" : opts.auto ? "auto-archive" : "archive",
    pattern: opts.pattern,
    agentsConsidered: agents.length,
    agentsSelected: selectedAgents.map((row) => row.item.id),
    workspacesConsidered: workspaces.length,
    workspacesSelected: selectedWorkspaces.map((row) => row.item.workspaceId),
    actions: [],
  };

  if (opts.json && !opts.archive) {
    console.log(JSON.stringify({ ...summary, agentRows, workspaceRows }, null, 2));
  } else if (!opts.json) {
    console.log("# Paseo Agent Cleanup");
    console.log(`\nmode: ${summary.mode}`);
    console.log(`pattern: ${opts.pattern}`);
    printTable("Agents", agentRows, "agent");
    printTable("Workspaces", workspaceRows, "workspace");
  }

  if (!opts.archive) {
    if (!opts.json) console.log("\n[dry-run] No changes made. Run without --dry-run to auto-archive safe agent candidates.");
    return;
  }

  if (!opts.auto && !opts.yes) {
    throw new Error("--archive requires --yes");
  }

  for (const row of selectedAgents) {
    const id = row.item.id;
    const result = archiveAgent(id);
    summary.actions.push({ type: "agent", id, status: result.status, stdout: result.stdout, stderr: result.stderr });
    if (!opts.json) console.log(`[archive agent] ${id} exit=${result.status}`);
  }

  for (const row of selectedWorkspaces) {
    const id = row.item.workspaceId;
    const result = archiveWorkspace(id);
    summary.actions.push({ type: "workspace", id, status: result.status, stdout: result.stdout, stderr: result.stderr });
    if (!opts.json) console.log(`[archive workspace] ${id} exit=${result.status}`);
  }

  const failed = summary.actions.filter((action) => action.status !== 0);
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  }
  if (failed.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
