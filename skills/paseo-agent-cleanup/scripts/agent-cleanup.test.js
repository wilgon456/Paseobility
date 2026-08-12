"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  execute,
  parseArgs,
  printHuman,
} = require("./agent-cleanup.js");

const idleAgent = {
  id: "agent-idle",
  shortId: "idle",
  name: "customer-session",
  status: "idle",
  cwd: "/projects/product",
  provider: "codex",
};

const testAgent = {
  id: "agent-test",
  shortId: "test",
  name: "cleanup-validation-test",
  status: "idle",
  cwd: "/tmp/cleanup-validation",
  provider: "codex",
};

const activeAgent = {
  id: "agent-active",
  shortId: "active",
  name: "cleanup-validation-test",
  status: "running",
  cwd: "/tmp/cleanup-validation",
  provider: "codex",
};

const testWorkspace = {
  workspaceId: "workspace-test",
  project: "cleanup-validation-test",
  cwd: "/tmp/cleanup-validation",
};

function createRunner(options = {}) {
  let agents = structuredClone(options.agents || []);
  let workspaces = structuredClone(options.workspaces || []);
  const calls = [];

  function response(status, payload = "", stderr = "") {
    return {
      status,
      stdout: typeof payload === "string" ? payload : JSON.stringify(payload),
      stderr,
    };
  }

  function run(command, args) {
    assert.equal(command, "paseo");
    calls.push([...args]);
    const key = args.join(" ");

    if (key === "ls --json") return response(0, agents);
    if (key === "workspace ls --json") return response(0, workspaces);

    if (args[0] === "archive") {
      const id = args[1];
      const exitCode = options.agentArchiveExitCode ?? 0;
      if (exitCode === 0 && !options.keepArchivedAgentListed) {
        agents = agents.filter((agent) => agent.id !== id);
      }
      const payload = options.providerRelease === undefined
        ? { archived: id }
        : { archived: id, providerRelease: options.providerRelease };
      return response(exitCode, payload, exitCode === 0 ? "" : "archive failed");
    }

    if (args[0] === "workspace" && args[1] === "archive") {
      const id = args[2];
      const exitCode = options.workspaceArchiveExitCode ?? 0;
      if (exitCode === 0 && !options.keepArchivedWorkspaceListed) {
        workspaces = workspaces.filter((workspace) => workspace.workspaceId !== id);
      }
      return response(exitCode, { archived: id }, exitCode === 0 ? "" : "archive failed");
    }

    throw new Error(`unexpected command: paseo ${key}`);
  }

  return { calls, run };
}

function assertNoDangerousCommands(calls) {
  const forbidden = /(^|\s)(delete|stop|kill|restart|history|timeline|resume)(\s|$)/i;
  for (const call of calls) {
    assert.doesNotMatch(call.join(" "), forbidden);
  }
}

test("bare invocation is a dry-run and preserves an ordinary idle agent", () => {
  const runner = createRunner({ agents: [idleAgent, testAgent] });
  const opts = parseArgs([]);
  const result = execute(opts, runner.run);

  assert.equal(opts.dryRun, true);
  assert.equal(opts.archive, false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.status, "dry-run");
  assert.deepEqual(result.summary.agentsSelected, [testAgent.id]);
  assert.equal(runner.calls.some((call) => call[0] === "archive"), false);
  assertNoDangerousCommands(runner.calls);
});

test("unfiltered --auto archives only clearly marked disposable agents", () => {
  const runner = createRunner({
    agents: [idleAgent, testAgent],
    providerRelease: "confirmed",
  });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.deepEqual(result.summary.agentsSelected, [testAgent.id]);
  assert.equal(result.summary.status, "success");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(
    runner.calls.filter((call) => call[0] === "archive"),
    [["archive", testAgent.id, "--json"]]
  );
  assertNoDangerousCommands(runner.calls);
});

test("an explicit inactive agent ID is archived and then rechecked", () => {
  const runner = createRunner({
    agents: [idleAgent, testAgent],
    providerRelease: true,
  });
  const result = execute(parseArgs(["--auto", "--agent", idleAgent.id]), runner.run);

  assert.deepEqual(result.summary.agentsSelected, [idleAgent.id]);
  assert.equal(result.summary.verification.agentListRechecked, true);
  assert.equal(result.summary.actions[0].paseoRecordRemoved, true);
  assert.equal(result.summary.actions[0].providerRelease, "confirmed");
  assert.equal(result.exitCode, 0);
});

test("a user pattern archives only matching inactive agents", () => {
  const runner = createRunner({
    agents: [idleAgent, testAgent],
    providerRelease: "released",
  });
  const result = execute(
    parseArgs(["--auto", "--pattern", "cleanup-validation"]),
    runner.run
  );

  assert.deepEqual(result.summary.agentsSelected, [testAgent.id]);
  assert.deepEqual(
    runner.calls.filter((call) => call[0] === "archive"),
    [["archive", testAgent.id, "--json"]]
  );
  assert.equal(result.exitCode, 0);
});

test("an active agent is never archived even when explicitly selected", () => {
  const runner = createRunner({ agents: [activeAgent] });
  const result = execute(
    parseArgs(["--agent", activeAgent.id, "--archive", "--yes"]),
    runner.run
  );

  assert.deepEqual(result.summary.agentsSelected, []);
  assert.equal(result.summary.status, "no-op");
  assert.equal(runner.calls.some((call) => call[0] === "archive"), false);
  assertNoDangerousCommands(runner.calls);
});

test("archive exit 0 fails verification when the agent remains listed", () => {
  const runner = createRunner({
    agents: [testAgent],
    providerRelease: "confirmed",
    keepArchivedAgentListed: true,
  });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.equal(result.summary.status, "failed");
  assert.equal(result.summary.actions[0].commandExitCode, 0);
  assert.equal(result.summary.actions[0].paseoRecordRemoved, false);
  assert.equal(result.summary.actions[0].outcome, "verification-failed");
  assert.equal(result.exitCode, 1);
});

test("unknown provider release is reported as a partial failure", () => {
  const runner = createRunner({ agents: [testAgent] });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.equal(result.summary.status, "partial-failure");
  assert.equal(result.summary.actions[0].paseoRecordRemoved, true);
  assert.equal(result.summary.actions[0].providerRelease, "unknown");
  assert.equal(result.summary.actions[0].outcome, "provider-release-unknown");
  assert.equal(result.exitCode, 1);

  const lines = [];
  const originalLog = console.log;
  console.log = (line = "") => lines.push(String(line));
  try {
    printHuman(result);
  } finally {
    console.log = originalLog;
  }
  const human = lines.join("\n");
  assert.match(human, /providerRelease=unknown/);
  assert.match(human, /result: partial-failure/);
  assert.match(human, /could not be confirmed/);

  const json = JSON.parse(JSON.stringify(result.summary));
  assert.equal(json.status, "partial-failure");
  assert.equal(json.actions[0].providerRelease, "unknown");
});

test("mixed archive outcomes are an explicit non-zero partial failure", () => {
  const secondTestAgent = {
    ...testAgent,
    id: "agent-test-2",
    shortId: "test-2",
    name: "second-validation-test",
  };
  let agents = [structuredClone(testAgent), structuredClone(secondTestAgent)];
  const calls = [];
  const run = (_command, args) => {
    calls.push([...args]);
    if (args.join(" ") === "ls --json") {
      return { status: 0, stdout: JSON.stringify(agents), stderr: "" };
    }
    if (args.join(" ") === "workspace ls --json") {
      return { status: 0, stdout: "[]", stderr: "" };
    }
    if (args[0] === "archive" && args[1] === testAgent.id) {
      agents = agents.filter((agent) => agent.id !== testAgent.id);
      return { status: 0, stdout: JSON.stringify({ providerRelease: "confirmed" }), stderr: "" };
    }
    if (args[0] === "archive" && args[1] === secondTestAgent.id) {
      return { status: 1, stdout: "", stderr: "native archive failed" };
    }
    throw new Error(`unexpected command: ${args.join(" ")}`);
  };

  const result = execute(parseArgs(["--auto"]), run);
  assert.equal(result.summary.status, "partial-failure");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    result.summary.actions.map((action) => action.outcome),
    ["success", "archive-command-failed"]
  );
  assertNoDangerousCommands(calls);
});

test("workspace archive requires explicit approval and is rechecked", () => {
  const previewRunner = createRunner({ workspaces: [testWorkspace] });
  const preview = execute(parseArgs(["--include-workspaces"]), previewRunner.run);
  assert.deepEqual(preview.summary.workspacesSelected, [testWorkspace.workspaceId]);
  assert.equal(previewRunner.calls.some((call) => call.includes("archive")), false);

  assert.throws(
    () => parseArgs(["--auto", "--workspace", testWorkspace.workspaceId]),
    /never archives workspaces/
  );
  assert.throws(
    () => parseArgs(["--workspace", testWorkspace.workspaceId, "--archive"]),
    /requires --yes/
  );

  const archiveRunner = createRunner({ workspaces: [testWorkspace] });
  const archived = execute(
    parseArgs(["--workspace", testWorkspace.workspaceId, "--archive", "--yes"]),
    archiveRunner.run
  );
  assert.equal(archived.summary.status, "success");
  assert.equal(archived.summary.verification.workspaceListRechecked, true);
  assert.equal(archived.summary.actions[0].paseoRecordRemoved, true);
  assert.equal(archived.exitCode, 0);
  assertNoDangerousCommands([...previewRunner.calls, ...archiveRunner.calls]);
});

test("the default catch-all pattern and unsafe implicit archive are gone", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.pattern, null);
  assert.equal(defaults.patternProvided, false);
  assert.throws(() => parseArgs(["--archive", "--yes"]), /requires --agent/);
});
