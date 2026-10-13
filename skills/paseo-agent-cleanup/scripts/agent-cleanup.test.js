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
  workspaceId: "workspace-test",
  pendingPermissionCount: 0,
};

const testAgent = {
  id: "agent-test",
  shortId: "test",
  name: "cleanup-validation-test",
  status: "idle",
  cwd: "/tmp/cleanup-validation",
  provider: "codex",
  workspaceId: "workspace-test",
  pendingPermissionCount: 0,
};

const activeAgent = {
  id: "agent-active",
  shortId: "active",
  name: "cleanup-validation-test",
  status: "running",
  cwd: "/tmp/cleanup-validation",
  provider: "codex",
  workspaceId: "workspace-test",
  pendingPermissionCount: 0,
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
    if (command === "snapshot") return response(0, {complete: true, serverId: "server-test", agents, workspaces});
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
      const payload = options.invalidArchiveResponse
        ? { archived: id }
        : { agentId: id, status: "archived", archivedAt: "2026-08-27T00:00:00.000Z" };
      return response(exitCode, payload, exitCode === 0 ? "" : "archive failed");
    }

    if (args[0] === "workspace" && args[1] === "archive") {
      const id = args[2];
      const exitCode = options.workspaceArchiveExitCode ?? 0;
      if (exitCode === 0 && !options.keepArchivedWorkspaceListed) {
        workspaces = workspaces.filter((workspace) => workspace.workspaceId !== id);
      }
      const payload = options.invalidWorkspaceArchiveResponse
        ? { archived: id }
        : { workspaceId: id, status: "archived", archivedAt: "2026-08-27T00:00:00.000Z" };
      return response(exitCode, payload, exitCode === 0 ? "" : "archive failed");
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
  });
  const result = execute(parseArgs(["--auto", "--agent", idleAgent.id]), runner.run);

  assert.deepEqual(result.summary.agentsSelected, [idleAgent.id]);
  assert.equal(result.summary.verification.agentListRechecked, true);
  assert.equal(result.summary.actions[0].paseoRecordRemoved, true);
  assert.equal(result.summary.actions[0].archiveAcknowledged, true);
  assert.equal(result.exitCode, 0);
});

test("a user pattern archives only matching inactive agents", () => {
  const runner = createRunner({
    agents: [idleAgent, testAgent],
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
    keepArchivedAgentListed: true,
  });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.equal(result.summary.status, "failed");
  assert.equal(result.summary.actions[0].commandExitCode, 0);
  assert.equal(result.summary.actions[0].paseoRecordRemoved, false);
  assert.equal(result.summary.actions[0].outcome, "verification-failed");
  assert.equal(result.exitCode, 1);
});

test("an invalid Paseo 0.6 archive response is reported as a partial failure", () => {
  const runner = createRunner({ agents: [testAgent], invalidArchiveResponse: true });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.equal(result.summary.status, "partial-failure");
  assert.equal(result.summary.actions[0].paseoRecordRemoved, true);
  assert.equal(result.summary.actions[0].archiveAcknowledged, false);
  assert.equal(result.summary.actions[0].outcome, "archive-response-invalid");
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
  assert.match(human, /archiveAcknowledged=false/);
  assert.match(human, /result: partial-failure/);

  const json = JSON.parse(JSON.stringify(result.summary));
  assert.equal(json.status, "partial-failure");
  assert.equal(json.actions[0].archiveAcknowledged, false);
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
    if (_command === "snapshot") return {status: 0, stdout: JSON.stringify({complete: true, serverId: "server-test", agents, workspaces: []}), stderr: ""};
    calls.push([...args]);
    if (args.join(" ") === "ls --json") {
      return { status: 0, stdout: JSON.stringify(agents), stderr: "" };
    }
    if (args.join(" ") === "workspace ls --json") {
      return { status: 0, stdout: "[]", stderr: "" };
    }
    if (args[0] === "archive" && args[1] === testAgent.id) {
      agents = agents.filter((agent) => agent.id !== testAgent.id);
      return {
        status: 0,
        stdout: JSON.stringify({
          agentId: testAgent.id,
          status: "archived",
          archivedAt: "2026-08-27T00:00:00.000Z",
        }),
        stderr: "",
      };
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

test("initializing agents are protected as active", () => {
  const initializingAgent = { ...testAgent, status: "initializing" };
  const runner = createRunner({ agents: [initializingAgent] });
  const result = execute(parseArgs(["--auto"]), runner.run);

  assert.deepEqual(result.summary.agentsSelected, []);
  assert.equal(result.summary.status, "no-op");
  assert.equal(runner.calls.some((call) => call[0] === "archive"), false);
});

test("unknown, missing and future statuses remain protected", () => {
  for (const status of ["unknown", "waiting", "", undefined, "completed", "exited"]) {
    const runner = createRunner({agents: [{...testAgent, status}]});
    const result = execute(parseArgs(["--auto"]), runner.run);
    assert.deepEqual(result.summary.agentsSelected, [], String(status));
    assert.equal(runner.calls.some(call => call[0] === "archive"), false);
  }
});

test("permission and unfinished attention block even an idle explicit target", () => {
  for (const state of [
    {pendingPermissionCount: 1}, {pendingPermissionCount: undefined},
    {requiresAttention: true, attentionReason: "permission"},
    {requiresAttention: true, attentionReason: "error"},
  ]) {
    const runner = createRunner({agents: [{...testAgent, ...state}]});
    const result = execute(parseArgs(["--agent", testAgent.id, "--archive", "--yes"]), runner.run);
    assert.deepEqual(result.summary.agentsSelected, []);
    assert.equal(runner.calls.some(call => call[0] === "archive"), false);
  }
});

test("finished attention permits a deliberately selected inactive agent", () => {
  const runner = createRunner({agents: [{...testAgent, requiresAttention: true, attentionReason: "finished"}]});
  assert.equal(execute(parseArgs(["--auto"]), runner.run).exitCode, 0);
  assert.equal(runner.calls.filter(call => call[0] === "archive").length, 1);
});

test("an agent becoming running after preview is protected before archive", () => {
  const runner = createRunner({agents: [{...testAgent, status: "running"}]});
  let reads = 0;
  const run = (command, args) => command === "snapshot" && ++reads === 1
    ? {status: 0, stdout: JSON.stringify({complete: true, serverId: "server-test", agents: [testAgent], workspaces: []})}
    : runner.run(command, args);
  const result = execute(parseArgs(["--auto"]), run);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.actions[0].outcome, "protected");
  assert.equal(runner.calls.some(call => call[0] === "archive"), false);
});

test("workspace archive protects active, unknown and permission-pending children", () => {
  for (const state of [{status: "running"}, {status: "unknown"}, {pendingPermissionCount: 1}]) {
    const runner = createRunner({agents: [{...testAgent, ...state}], workspaces: [testWorkspace]});
    const result = execute(parseArgs(["--workspace", testWorkspace.workspaceId, "--archive", "--yes"]), runner.run);
    assert.equal(result.exitCode, 1);
    assert.equal(result.summary.actions[0].outcome, "protected");
    assert.equal(runner.calls.some(call => call.includes("archive")), false);
  }
});

test("workspace archive refuses unproven ownership instead of comparing cwd", () => {
  const runner = createRunner({agents: [{...testAgent, workspaceId: undefined}], workspaces: [testWorkspace]});
  const result = execute(parseArgs(["--workspace", testWorkspace.workspaceId, "--archive", "--yes"]), runner.run);
  assert.equal(result.exitCode, 1);
  assert.match(result.summary.actions[0].reason, /ownership unknown/);
});

test("same cwd does not make another workspace's running agent a child", () => {
  const runner = createRunner({agents: [{...activeAgent, workspaceId: "different-workspace"}], workspaces: [testWorkspace]});
  assert.equal(execute(parseArgs(["--workspace", testWorkspace.workspaceId, "--archive", "--yes"]), runner.run).exitCode, 0);
});

test("incomplete or identity-changing snapshots authorize no archive", () => {
  for (const bad of [{complete: false}, {agents: null}, {agents: [testAgent, testAgent]}]) {
    const run = () => ({status: 0, stdout: JSON.stringify({complete: true, serverId: "server-test", agents: [testAgent], workspaces: [], ...bad})});
    assert.throws(() => execute(parseArgs(["--auto"]), run), /snapshot|record/i);
  }
  let reads = 0, archived = false;
  const run = (command) => {
    if (command !== "snapshot") {archived = true; throw Error("must not archive");}
    return {status: 0, stdout: JSON.stringify({complete: true, serverId: ++reads === 1 ? "server-test" : "server-replaced", agents: [testAgent], workspaces: []})};
  };
  const changed = execute(parseArgs(["--auto"]), run);
  assert.equal(changed.exitCode, 1);
  assert.equal(changed.summary.actions[0].outcome, "precheck-failed");
  assert.equal(archived, false);
});

test("an explicit workspace request never implicitly archives disposable agents elsewhere", () => {
  const runner = createRunner({agents: [{...testAgent, workspaceId: "different-workspace"}], workspaces: [testWorkspace]});
  const result = execute(parseArgs(["--workspace", testWorkspace.workspaceId, "--archive", "--yes"]), runner.run);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(runner.calls, [["workspace", "archive", testWorkspace.workspaceId, "--json"]]);
});

test("a failed fresh snapshot retains prior verified effects as partial failure", () => {
  const second = {...testAgent, id: "second-agent"};
  const runner = createRunner({agents: [testAgent, second]});
  let reads = 0;
  const run = (command, args) => command === "snapshot" && ++reads === 4
    ? {status: 1, stdout: ""} : runner.run(command, args);
  const result = execute(parseArgs(["--auto"]), run);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.status, "partial-failure");
  assert.deepEqual(result.summary.actions.map(action => action.outcome), ["success", "precheck-failed"]);
  assert.equal(runner.calls.length, 1);
});

test("ambiguous short IDs refuse selection and cannot corrupt full-ID verification", () => {
  const other = {...testAgent, id: "other-agent"};
  const runner = createRunner({agents: [testAgent, other]});
  const ambiguous = execute(parseArgs(["--agent", testAgent.shortId, "--archive", "--yes"]), runner.run);
  assert.equal(ambiguous.exitCode, 1);
  assert.match(ambiguous.summary.validationErrors[0], /ambiguous/);
  assert.equal(runner.calls.length, 0);
  const exact = execute(parseArgs(["--agent", testAgent.id, "--archive", "--yes"]), runner.run);
  assert.equal(exact.exitCode, 0);
});

test("a disposable selection that changes before dispatch remains untouched", () => {
  const original = {...testAgent, name:"fixture-test", cwd:"/projects/app"};
  const runner = createRunner({agents:[{...original,name:"normal-work"}]});
  let reads=0;
  const run=(command,args)=>command==="snapshot" && ++reads===1
    ? {status:0,stdout:JSON.stringify({complete:true,serverId:"server-test",agents:[original],workspaces:[]})}
    : runner.run(command,args);
  const result=execute(parseArgs(["--auto"]),run);
  assert.equal(result.exitCode,1);
  assert.match(result.summary.actions[0].reason,/selection no longer/);
  assert.equal(runner.calls.length,0);
});
