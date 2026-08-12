"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { spawnSync } = require("node:child_process");

const {
  MAX_BYTES,
  resolveDefaultGithubRepository,
  resolveWithin,
  sha256,
  validateArtifactMetadata,
  validateDefaultRepositoryTree,
  validateFetchedPayload,
  validatePortableFileName
} = require("./paseo-share.js");

const CLI_SCRIPT = path.join(__dirname, "paseo-share.js");

function commandResult(ok, stdout = "", stderr = "", status = ok ? 0 : 1) {
  return { ok, status, stdout, stderr };
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI_SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    windowsHide: true
  });
}

function createGithubRunner(options = {}) {
  const owner = options.owner || "octocat";
  const repositoryName = `${owner}/paseo_share`;
  const calls = [];
  let repositoryLookups = 0;
  const repository = options.repository || {
    full_name: repositoryName,
    private: true,
    size: 0,
    default_branch: "main",
    clone_url: `https://github.com/${repositoryName}.git`
  };
  const tree = options.tree || {
    truncated: false,
    tree: [
      { path: "artifacts", type: "tree" },
      { path: "artifacts/.gitkeep", type: "blob" }
    ]
  };

  function runGh(args) {
    calls.push(args);
    const key = args.join(" ");
    if (key === "--version") {
      return options.ghAvailable === false
        ? commandResult(false, "", "gh not found")
        : commandResult(true, "gh version 2");
    }
    if (key === "auth status --hostname github.com") {
      return options.authenticated === false
        ? commandResult(false, "", "not logged in")
        : commandResult(true);
    }
    if (key === "auth setup-git --hostname github.com") {
      return options.gitAuth === false
        ? commandResult(false, "", "credential helper failed")
        : commandResult(true);
    }
    if (key === "api user --jq .login") return commandResult(true, owner);
    if (key === `api repos/${repositoryName}`) {
      repositoryLookups += 1;
      if (options.repositoryMissing && repositoryLookups === 1) {
        return commandResult(false, "", "HTTP 404: Not Found", 1);
      }
      if (options.repositoryError) {
        return commandResult(false, "", options.repositoryError, 1);
      }
      return commandResult(true, JSON.stringify(repository));
    }
    if (key.startsWith(`repo create ${repositoryName} `)) {
      return options.createFails
        ? commandResult(false, "", "creation failed")
        : commandResult(true, `https://github.com/${repositoryName}`);
    }
    if (key.startsWith(`api repos/${repositoryName}/git/trees/`)) {
      if (options.treeError) return commandResult(false, "", options.treeError);
      return commandResult(true, JSON.stringify(tree));
    }
    throw new Error(`unexpected mocked gh command: ${key}`);
  }

  return { calls, runGh };
}

test("help and --help exit 0, print usage, and cause no side effects", () => {
  const shareHome = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-share-help-"));
  try {
    for (const args of [[], ["help"], ["--help"]]) {
      const result = runCli(args, { PASEO_SHARE_HOME: shareHome });
      assert.equal(result.status, 0, `expected exit 0 for ${JSON.stringify(args)}`);
      assert.match(result.stdout, /Paseo Share/);
      assert.match(result.stdout, /Usage:/);
      assert.match(result.stdout, /paseo-share\.js status/);
      assert.equal(result.stderr, "");
    }
    assert.deepEqual(fs.readdirSync(shareHome), []);
  } finally {
    fs.rmSync(shareHome, { recursive: true, force: true });
  }
});

test("unknown command exits nonzero without printing usage as success", () => {
  const shareHome = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-share-unknown-"));
  try {
    const result = runCli(["not-a-real-command"], { PASEO_SHARE_HOME: shareHome });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown command: not-a-real-command/);
    assert.equal(result.stdout, "");
    assert.deepEqual(fs.readdirSync(shareHome), []);
  } finally {
    fs.rmSync(shareHome, { recursive: true, force: true });
  }
});

test("requests GitHub connection when gh is missing or unauthenticated", () => {
  const missing = createGithubRunner({ ghAvailable: false });
  assert.throws(
    () => resolveDefaultGithubRepository(missing.runGh),
    /GitHub CLI is required/
  );

  const unauthenticated = createGithubRunner({ authenticated: false });
  assert.throws(
    () => resolveDefaultGithubRepository(unauthenticated.runGh),
    /GitHub connection is required/
  );

  const gitAuthFailure = createGithubRunner({ gitAuth: false });
  assert.throws(
    () => resolveDefaultGithubRepository(gitAuthFailure.runGh),
    /local Git authentication could not be configured/
  );
});

test("creates owner/paseo_share as private when the repository is missing", () => {
  const mocked = createGithubRunner({ repositoryMissing: true });
  const result = resolveDefaultGithubRepository(mocked.runGh);
  assert.deepEqual(result, {
    owner: "octocat",
    repositoryName: "octocat/paseo_share",
    repositoryUrl: "https://github.com/octocat/paseo_share.git",
    repositoryCreated: true
  });
  const createCall = mocked.calls.find((args) => args[0] === "repo" && args[1] === "create");
  assert.ok(createCall);
  assert.ok(createCall.includes("--private"));
  assert.ok(mocked.calls.some((args) => args.join(" ") === "auth setup-git --hostname github.com"));
});

test("reuses an existing empty private paseo_share repository", () => {
  const mocked = createGithubRunner({ treeError: "gh: Git Repository is empty. (HTTP 409)" });
  const result = resolveDefaultGithubRepository(mocked.runGh);
  assert.equal(result.repositoryCreated, false);
  assert.equal(result.repositoryName, "octocat/paseo_share");
  assert.equal(mocked.calls.some((args) => args[0] === "repo" && args[1] === "create"), false);
});

test("reuses an existing private repository only when it has the Paseo Share tree", () => {
  const mocked = createGithubRunner({
    repository: {
      full_name: "octocat/paseo_share",
      private: true,
      size: 4,
      default_branch: "main",
      clone_url: "https://github.com/octocat/paseo_share.git"
    }
  });
  const result = resolveDefaultGithubRepository(mocked.runGh);
  assert.equal(result.repositoryCreated, false);
  assert.ok(mocked.calls.some((args) => args.join(" ").includes("/git/trees/main?recursive=1")));
});

test("refuses a public paseo_share repository", () => {
  const mocked = createGithubRunner({
    repository: {
      full_name: "octocat/paseo_share",
      private: false,
      size: 0,
      default_branch: "main",
      clone_url: "https://github.com/octocat/paseo_share.git"
    }
  });
  assert.throws(
    () => resolveDefaultGithubRepository(mocked.runGh),
    /is public/
  );
});

test("refuses an unrelated or incompletely inspected private repository", () => {
  const apiFailure = createGithubRunner({ repositoryError: "HTTP 500: service unavailable" });
  assert.throws(
    () => resolveDefaultGithubRepository(apiFailure.runGh),
    /could not inspect/
  );
  assert.equal(apiFailure.calls.some((args) => args[0] === "repo" && args[1] === "create"), false);

  const createFailure = createGithubRunner({ repositoryMissing: true, createFails: true });
  assert.throws(
    () => resolveDefaultGithubRepository(createFailure.runGh),
    /could not create private repository/
  );

  const smallUnrelated = createGithubRunner({
    repository: {
      full_name: "octocat/paseo_share",
      private: true,
      size: 0,
      default_branch: "main",
      clone_url: "https://github.com/octocat/paseo_share.git"
    },
    tree: {
      truncated: false,
      tree: [{ path: "README.md", type: "blob" }]
    }
  });
  assert.throws(
    () => resolveDefaultGithubRepository(smallUnrelated.runGh),
    /not a recognized Paseo Share repository/
  );
  assert.throws(
    () => validateDefaultRepositoryTree({
      truncated: false,
      tree: [{ path: "README.md", type: "blob" }]
    }),
    /not a recognized Paseo Share repository/
  );
  assert.throws(
    () => validateDefaultRepositoryTree({
      truncated: true,
      tree: [{ path: "artifacts/.gitkeep", type: "blob" }]
    }),
    /could not safely inspect/
  );
});

function fixture(t) {
  const checkoutPath = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-share-security-"));
  t.after(() => fs.rmSync(checkoutPath, { recursive: true, force: true }));
  const config = {
    checkoutPath,
    machine: "machine-a",
    maxBytes: MAX_BYTES
  };
  const createdAt = "2026-08-11T03:24:01.000Z";
  const id = "psh_20260811T032401Z_16d876";
  const name = "result.txt";
  const relativePath = `artifacts/machine-a/2026/08/${id}/${name}`;
  const payloadPath = resolveWithin(checkoutPath, relativePath, "test payload path");
  fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
  fs.writeFileSync(payloadPath, "hello from paseo share\n");
  const metadata = {
    version: 1,
    id,
    name,
    machine: "machine-a",
    createdAt,
    size: fs.statSync(payloadPath).size,
    sha256: sha256(payloadPath),
    note: "test",
    relativePath
  };
  const metadataPath = path.join(path.dirname(payloadPath), "artifact.json");
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
  return { checkoutPath, config, metadata, metadataPath, payloadPath };
}

test("accepts a valid artifact and verifies its payload", (t) => {
  const value = fixture(t);
  assert.equal(validateArtifactMetadata(value.metadata, value.config, value.metadataPath), value.metadata);
  assert.equal(validateFetchedPayload(value.payloadPath, value.metadata, value.config).stat.isFile(), true);
});

test("rejects traversal and absolute artifact paths", (t) => {
  const value = fixture(t);
  assert.throws(
    () => resolveWithin(value.checkoutPath, "../../outside.txt", "artifact relative path"),
    /unsafe path segment|escapes/
  );
  assert.throws(
    () => resolveWithin(value.checkoutPath, "/absolute.txt", "artifact relative path"),
    /cannot be absolute/
  );
  assert.throws(
    () => resolveWithin(value.checkoutPath, "artifacts\\outside.txt", "artifact relative path"),
    /forward slashes/
  );
});

test("rejects metadata whose path fields do not agree", (t) => {
  const value = fixture(t);
  assert.throws(
    () => validateArtifactMetadata(
      { ...value.metadata, relativePath: "artifacts/machine-a/2026/08/psh_20260811T032401Z_16d876/other.txt" },
      value.config,
      value.metadataPath
    ),
    /does not match/
  );
  assert.throws(
    () => validateArtifactMetadata(value.metadata, value.config, path.join(value.checkoutPath, "artifact.json")),
    /outside its declared artifact directory/
  );
});

test("rejects traversal, control characters, and Windows reserved filenames", () => {
  for (const unsafeName of ["../secret.txt", "folder/file.txt", "folder\\file.txt", "bad\nname.txt", "CON.txt", "trail. "]) {
    assert.throws(() => validatePortableFileName(unsafeName));
  }
  assert.equal(validatePortableFileName("한글-result_01.txt"), "한글-result_01.txt");
});

test("rejects payload size and checksum tampering", (t) => {
  const value = fixture(t);
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, { ...value.metadata, size: value.metadata.size + 1 }, value.config),
    /does not match metadata/
  );
  fs.writeFileSync(value.payloadPath, "jello from paseo share\n");
  assert.equal(fs.statSync(value.payloadPath).size, value.metadata.size);
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, value.metadata, value.config),
    /does not match metadata/
  );
});

test("accepts a legacy CRLF hash and reconstructs the original bytes", (t) => {
  const value = fixture(t);
  const crlf = Buffer.from(fs.readFileSync(value.payloadPath, "utf8").replace(/\r?\n/g, "\r\n"));
  const legacyMetadata = {
    ...value.metadata,
    size: crlf.length,
    sha256: crypto.createHash("sha256").update(crlf).digest("hex")
  };
  const verified = validateFetchedPayload(value.payloadPath, legacyMetadata, value.config);
  assert.equal(verified.legacyLineEndings, true);
  assert.deepEqual(verified.buffer, crlf);
});

test("rejects a symbolic-link payload", (t) => {
  const value = fixture(t);
  const externalPath = path.join(value.checkoutPath, "outside.txt");
  fs.writeFileSync(externalPath, "hello from paseo share\n");
  fs.unlinkSync(value.payloadPath);
  try {
    fs.symlinkSync(externalPath, value.payloadPath, "file");
  } catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("Windows symlink creation is not permitted in this environment");
      return;
    }
    throw error;
  }
  assert.throws(
    () => validateFetchedPayload(value.payloadPath, value.metadata, value.config),
    /symbolic link/
  );
});
