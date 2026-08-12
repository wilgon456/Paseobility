#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_FILENAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 2000;
const DEFAULT_GITHUB_HOST = "github.com";
const DEFAULT_REPOSITORY_NAME = "paseo_share";
const ARTIFACT_ID_PATTERN = /^psh_\d{8}T\d{6}Z_[a-f0-9]{6}$/;
const MACHINE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WINDOWS_RESERVED_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const INVALID_PORTABLE_FILENAME_PATTERN = /[<>:"/\\|?*\u0000-\u001f\u007f]/;
const BOOLEAN_OPTIONS = new Set(["json", "force", "help"]);
const ALLOWED_EXTENSIONS = new Set([
  ".astro", ".bash", ".c", ".cc", ".cfg", ".clj", ".cljs", ".conf",
  ".cpp", ".cs", ".css", ".csv", ".cxx", ".dart", ".diff", ".docx",
  ".erl", ".ex", ".exs", ".fish", ".gif", ".go", ".gql", ".gradle",
  ".graphql", ".groovy", ".h", ".hpp", ".hrl", ".htm", ".html",
  ".ini", ".java", ".jpeg", ".jpg", ".js", ".json", ".jsx", ".kt",
  ".kts", ".less", ".lua", ".md", ".mjs", ".mts", ".nix", ".patch",
  ".pdf", ".php", ".png", ".proto", ".ps1", ".py", ".r", ".rb",
  ".rs", ".sass", ".scala", ".scss", ".sh", ".sql", ".svelte", ".svg",
  ".swift", ".tf", ".tfvars", ".toml", ".ts", ".tsx", ".txt", ".vue",
  ".webp", ".xlsx", ".xml", ".yaml", ".yml", ".zsh"
]);
const TEXT_EXTENSIONS = new Set([
  ".astro", ".bash", ".c", ".cc", ".cfg", ".clj", ".cljs", ".conf",
  ".cpp", ".cs", ".css", ".csv", ".cxx", ".dart", ".diff", ".erl",
  ".ex", ".exs", ".fish", ".go", ".gql", ".gradle", ".graphql",
  ".groovy", ".h", ".hpp", ".hrl", ".htm", ".html", ".ini", ".java",
  ".js", ".json", ".jsx", ".kt", ".kts", ".less", ".lua", ".md",
  ".mjs", ".mts", ".nix", ".patch", ".php", ".proto", ".ps1", ".py",
  ".r", ".rb", ".rs", ".sass", ".scala", ".scss", ".sh", ".sql",
  ".svelte", ".svg", ".swift", ".tf", ".tfvars", ".toml", ".ts",
  ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml", ".zsh"
]);
const SAFE_EXTENSIONLESS_NAMES = new Set([
  "dockerfile", "gemfile", "justfile", "makefile", "procfile", "rakefile"
]);
const SECRET_NAME_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^(?:id_)?(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i,
  /(?:^|[._-])credentials?(?:[._-]|$)/i,
  /(?:^|[._-])secrets?(?:[._-]|$)/i,
  /\.(?:key|keystore|p12|pfx|pem)$/i
];
const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
];

function fail(message, code = 1) {
  process.stderr.write(`paseo-share: ${message}\n`);
  process.exit(code);
}

function redact(value) {
  return String(value || "").replace(
    /(https?:\/\/)[^/@\s]+@/gi,
    "$1***@"
  );
}

function validationError(message) {
  const error = new Error(message);
  error.name = "PaseoShareValidationError";
  return error;
}

function assertValid(condition, message) {
  if (!condition) throw validationError(message);
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }
    const key = item.slice(2);
    if (!key) fail("invalid empty option");
    if (BOOLEAN_OPTIONS.has(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`--${key} requires a value`);
    }
    options[key] = value;
    index += 1;
  }
  return { positionals, options };
}

function stateRoot() {
  return process.env.PASEO_SHARE_HOME
    ? path.resolve(process.env.PASEO_SHARE_HOME)
    : path.join(os.homedir(), ".paseo", "share");
}

function configPath() {
  return path.join(stateRoot(), "config.json");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    windowsHide: true
  });
  if (result.error) {
    if (options.allowFailure) return { ok: false, stdout: "", stderr: result.error.message };
    fail(`${command} could not run: ${result.error.message}`);
  }
  const response = {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim()
  };
  if (!response.ok && !options.allowFailure) {
    fail(redact(response.stderr || `${command} exited with status ${result.status}`));
  }
  return response;
}

function runBuffer(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: null,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    maxBuffer: MAX_BYTES + (1024 * 1024),
    windowsHide: true
  });
  if (result.error) {
    if (options.allowFailure) {
      return { ok: false, stdout: Buffer.alloc(0), stderr: result.error.message };
    }
    fail(`${command} could not run: ${result.error.message}`);
  }
  const response = {
    ok: result.status === 0,
    stdout: result.stdout || Buffer.alloc(0),
    stderr: (result.stderr || Buffer.alloc(0)).toString("utf8").trim()
  };
  if (!response.ok && !options.allowFailure) {
    fail(redact(response.stderr || `${command} exited with status ${result.status}`));
  }
  return response;
}

function git(args, cwd, allowFailure = false) {
  return run("git", args, { cwd, allowFailure });
}

function gitBuffer(args, cwd, allowFailure = false) {
  return runBuffer("git", args, { cwd, allowFailure });
}

function gh(args, allowFailure = false) {
  return run("gh", args, { allowFailure });
}

function ensureGit() {
  run("git", ["--version"]);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function loadConfig() {
  const filePath = configPath();
  if (!fs.existsSync(filePath)) {
    fail(`not configured; run onboard for the default private GitHub repository, or setup <private-repo-url> for a custom remote (config: ${filePath})`, 2);
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`cannot read config ${filePath}: ${error.message}`);
  }
  for (const key of ["repositoryUrl", "branch", "machine", "checkoutPath"]) {
    if (!config[key]) fail(`config is missing ${key}: ${filePath}`);
  }
  if (!MACHINE_PATTERN.test(config.machine)) {
    fail(`config has an invalid machine name: ${filePath}`);
  }
  if (
    config.maxBytes !== undefined &&
    (!Number.isSafeInteger(config.maxBytes) || config.maxBytes < 1 || config.maxBytes > MAX_BYTES)
  ) {
    fail(`config has an invalid maxBytes value: ${filePath}`);
  }
  return config;
}

function sanitizeMachine(value) {
  const normalized = String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return normalized || `machine-${crypto.randomBytes(3).toString("hex")}`;
}

function validatePortableFileName(name) {
  assertValid(typeof name === "string" && name.length > 0, "artifact name must be a non-empty string");
  assertValid(name !== "." && name !== "..", "artifact name cannot be . or ..");
  assertValid(name.length <= MAX_FILENAME_LENGTH, `artifact name exceeds ${MAX_FILENAME_LENGTH} characters`);
  assertValid(!INVALID_PORTABLE_FILENAME_PATTERN.test(name), "artifact name contains a cross-platform unsafe character");
  assertValid(!/[. ]$/.test(name), "artifact name cannot end with a dot or space");
  assertValid(!WINDOWS_RESERVED_NAME_PATTERN.test(name), `artifact name is reserved on Windows: ${name}`);
  assertValid(path.posix.basename(name) === name, "artifact name cannot contain path separators");
  assertValid(path.win32.basename(name) === name, "artifact name cannot contain path separators");
  return name;
}

function validateArtifactNamePolicy(name) {
  validatePortableFileName(name);
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    throw validationError(`refusing secret-looking file name: ${name}`);
  }
  const extension = path.extname(name).toLowerCase();
  if (
    extension &&
    !ALLOWED_EXTENSIONS.has(extension) &&
    !SAFE_EXTENSIONLESS_NAMES.has(name.toLowerCase())
  ) {
    throw validationError(`unsupported file type ${extension}; share documents, code, PDFs, or images only`);
  }
  return extension;
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(rootPath, candidatePath) {
  const root = pathKey(rootPath);
  const candidate = pathKey(candidatePath);
  return candidate.startsWith(`${root}${path.sep}`);
}

function resolveWithin(rootPath, relativePath, label = "path") {
  assertValid(typeof relativePath === "string" && relativePath.length > 0, `${label} must be a non-empty string`);
  assertValid(!relativePath.includes("\\"), `${label} must use forward slashes`);
  assertValid(!path.posix.isAbsolute(relativePath), `${label} cannot be absolute`);
  const segments = relativePath.split("/");
  assertValid(
    segments.every((segment) => segment && segment !== "." && segment !== ".."),
    `${label} contains an unsafe path segment`
  );
  const resolved = path.resolve(rootPath, ...segments);
  assertValid(isPathInside(rootPath, resolved), `${label} escapes its allowed root`);
  return resolved;
}

function validateArtifactMetadata(metadata, config, metadataPath) {
  assertValid(
    metadata && typeof metadata === "object" && !Array.isArray(metadata),
    "artifact metadata must be a JSON object"
  );
  assertValid(metadata.version === 1, "unsupported artifact metadata version");
  assertValid(typeof metadata.id === "string" && ARTIFACT_ID_PATTERN.test(metadata.id), "invalid artifact ID");
  validateArtifactNamePolicy(metadata.name);
  assertValid(
    typeof metadata.machine === "string" && MACHINE_PATTERN.test(metadata.machine),
    "invalid artifact machine name"
  );
  assertValid(typeof metadata.createdAt === "string", "invalid artifact creation time");
  const createdAt = new Date(metadata.createdAt);
  assertValid(
    !Number.isNaN(createdAt.getTime()) && createdAt.toISOString() === metadata.createdAt,
    "invalid artifact creation time"
  );
  assertValid(
    Number.isSafeInteger(metadata.size) && metadata.size >= 0 && metadata.size <= (config.maxBytes || MAX_BYTES),
    "invalid artifact size"
  );
  assertValid(typeof metadata.sha256 === "string" && SHA256_PATTERN.test(metadata.sha256), "invalid artifact SHA-256");
  assertValid(
    metadata.note === undefined || (typeof metadata.note === "string" && metadata.note.length <= MAX_NOTE_LENGTH),
    `artifact note must be at most ${MAX_NOTE_LENGTH} characters`
  );
  assertValid(typeof metadata.relativePath === "string", "invalid artifact relative path");

  const expectedRelativePath = [
    "artifacts",
    metadata.machine,
    String(createdAt.getUTCFullYear()),
    String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
    metadata.id,
    metadata.name
  ].join("/");
  assertValid(
    metadata.relativePath === expectedRelativePath,
    "artifact relative path does not match its signed metadata fields"
  );
  resolveWithin(config.checkoutPath, metadata.relativePath, "artifact relative path");

  if (metadataPath) {
    const expectedMetadataPath = resolveWithin(
      config.checkoutPath,
      `${path.posix.dirname(expectedRelativePath)}/artifact.json`,
      "artifact metadata path"
    );
    assertValid(
      pathKey(metadataPath) === pathKey(expectedMetadataPath),
      "artifact metadata file is stored outside its declared artifact directory"
    );
  }
  return metadata;
}

function rejectCredentialUrl(repositoryUrl) {
  if (!/^https?:\/\//i.test(repositoryUrl)) return;
  let parsed;
  try {
    parsed = new URL(repositoryUrl);
  } catch (error) {
    fail(`invalid repository URL: ${error.message}`);
  }
  if (parsed.username || parsed.password) {
    fail("do not embed credentials in the repository URL; use SSH or a credential manager");
  }
}

function parseCommandJson(response, label) {
  try {
    return JSON.parse(response.stdout);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function isNotFoundResponse(response) {
  return /(?:HTTP 404|not found)/i.test(response.stderr || "");
}

function isEmptyRepositoryResponse(response) {
  return /Git Repository is empty/i.test(response.stderr || "");
}

function validateDefaultRepositoryTree(tree) {
  if (!tree || !Array.isArray(tree.tree) || tree.truncated) {
    throw new Error("could not safely inspect the existing paseo_share repository tree");
  }
  const paths = tree.tree
    .map((entry) => entry && entry.path)
    .filter((entryPath) => typeof entryPath === "string" && entryPath.length > 0);
  const onlyArtifacts = paths.every(
    (entryPath) => entryPath === "artifacts" || entryPath.startsWith("artifacts/")
  );
  const hasShareMarker = paths.some(
    (entryPath) => entryPath === "artifacts/.gitkeep" || entryPath.endsWith("/artifact.json")
  );
  if (!onlyArtifacts || !hasShareMarker) {
    throw new Error(
      `private repository ${DEFAULT_REPOSITORY_NAME} already exists but is not a recognized Paseo Share repository; rename it or use setup <private-repo-url> with a different dedicated repository`
    );
  }
}

function resolveDefaultGithubRepository(runGh = gh) {
  const version = runGh(["--version"], true);
  if (!version.ok) {
    throw new Error("GitHub CLI is required for automatic setup; install gh, then run gh auth login");
  }

  const auth = runGh(["auth", "status", "--hostname", DEFAULT_GITHUB_HOST], true);
  if (!auth.ok) {
    throw new Error("GitHub connection is required; run gh auth login --hostname github.com, then retry Paseo Share");
  }

  const gitAuth = runGh(["auth", "setup-git", "--hostname", DEFAULT_GITHUB_HOST], true);
  if (!gitAuth.ok) {
    throw new Error(`GitHub is connected but local Git authentication could not be configured: ${redact(gitAuth.stderr)}`);
  }

  const userResponse = runGh(["api", "user", "--jq", ".login"], true);
  if (!userResponse.ok || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(userResponse.stdout)) {
    throw new Error("could not determine the authenticated GitHub account");
  }
  const owner = userResponse.stdout;
  const repositoryName = `${owner}/${DEFAULT_REPOSITORY_NAME}`;
  const apiPath = `repos/${repositoryName}`;
  let repositoryResponse = runGh(["api", apiPath], true);
  let repositoryCreated = false;

  if (!repositoryResponse.ok) {
    if (!isNotFoundResponse(repositoryResponse)) {
      throw new Error(`could not inspect ${repositoryName}: ${redact(repositoryResponse.stderr)}`);
    }
    const createResponse = runGh([
      "repo",
      "create",
      repositoryName,
      "--private",
      "--description",
      "Private artifact repository for Paseo Share"
    ], true);
    if (!createResponse.ok) {
      throw new Error(`could not create private repository ${repositoryName}: ${redact(createResponse.stderr)}`);
    }
    repositoryCreated = true;
    repositoryResponse = runGh(["api", apiPath], true);
    if (!repositoryResponse.ok) {
      throw new Error(`created ${repositoryName}, but could not verify it: ${redact(repositoryResponse.stderr)}`);
    }
  }

  const repository = parseCommandJson(repositoryResponse, repositoryName);
  if (String(repository.full_name || "").toLowerCase() !== repositoryName.toLowerCase()) {
    throw new Error(`GitHub returned an unexpected repository for ${repositoryName}`);
  }
  if (repository.private !== true) {
    throw new Error(
      `repository ${repositoryName} is public; make it private or rename it before retrying automatic Paseo Share setup`
    );
  }
  if (!repositoryCreated) {
    const branch = repository.default_branch || "main";
    const treeResponse = runGh([
      "api",
      `repos/${repositoryName}/git/trees/${encodeURIComponent(branch)}?recursive=1`
    ], true);
    if (!treeResponse.ok) {
      if (!isEmptyRepositoryResponse(treeResponse)) {
        throw new Error(`could not inspect existing repository ${repositoryName}: ${redact(treeResponse.stderr)}`);
      }
    } else {
      validateDefaultRepositoryTree(parseCommandJson(treeResponse, `${repositoryName} tree`));
    }
  }

  const repositoryUrl = `https://${DEFAULT_GITHUB_HOST}/${repositoryName}.git`;
  return { owner, repositoryName, repositoryUrl, repositoryCreated };
}

function ensureIdentity(checkoutPath, machine) {
  if (!git(["config", "user.name"], checkoutPath, true).stdout) {
    git(["config", "user.name", `Paseo Share (${machine})`], checkoutPath);
  }
  if (!git(["config", "user.email"], checkoutPath, true).stdout) {
    git(["config", "user.email", "paseo-share@users.noreply.github.com"], checkoutPath);
  }
}

function currentBranch(checkoutPath) {
  return git(["branch", "--show-current"], checkoutPath, true).stdout;
}

function remoteBranchExists(checkoutPath, branch) {
  return git(
    ["show-ref", "--verify", `refs/remotes/origin/${branch}`],
    checkoutPath,
    true
  ).ok;
}

function localHeadExists(checkoutPath) {
  return git(["rev-parse", "--verify", "HEAD"], checkoutPath, true).ok;
}

function commandSetup(positionals, options, resultExtras = {}) {
  ensureGit();
  const repositoryUrl = positionals[0];
  if (!repositoryUrl) fail("usage: setup <repo-url> [--machine <name>] [--branch <name>]");
  rejectCredentialUrl(repositoryUrl);

  const machine = sanitizeMachine(options.machine || os.hostname());
  const checkoutPath = path.resolve(options.checkout || path.join(stateRoot(), "repo"));
  const gitDirectory = path.join(checkoutPath, ".git");

  if (fs.existsSync(checkoutPath) && !fs.existsSync(gitDirectory)) {
    const entries = fs.readdirSync(checkoutPath);
    if (entries.length > 0) fail(`checkout path exists and is not a Git repository: ${checkoutPath}`);
  }
  if (!fs.existsSync(gitDirectory)) {
    fs.mkdirSync(path.dirname(checkoutPath), { recursive: true, mode: 0o700 });
    git(["clone", repositoryUrl, checkoutPath], process.cwd());
  } else {
    const existingRemote = git(["remote", "get-url", "origin"], checkoutPath).stdout;
    if (existingRemote !== repositoryUrl) {
      fail(`managed checkout already uses a different origin: ${redact(existingRemote)}`);
    }
  }

  git(["fetch", "origin"], checkoutPath, true);
  let branch = options.branch || currentBranch(checkoutPath) || "main";
  const branchCheck = git(["check-ref-format", "--branch", branch], checkoutPath, true);
  if (!branchCheck.ok) fail(`invalid Git branch name: ${branch}`);
  if (currentBranch(checkoutPath) !== branch) {
    if (remoteBranchExists(checkoutPath, branch)) {
      git(["checkout", "-B", branch, `origin/${branch}`], checkoutPath);
    } else {
      git(["checkout", "-B", branch], checkoutPath);
    }
  }
  ensureIdentity(checkoutPath, machine);

  if (!localHeadExists(checkoutPath)) {
    const keepFile = path.join(checkoutPath, "artifacts", ".gitkeep");
    fs.mkdirSync(path.dirname(keepFile), { recursive: true });
    fs.writeFileSync(keepFile, "");
    git(["add", "artifacts/.gitkeep"], checkoutPath);
    git(["commit", "-m", "Initialize Paseo Share"], checkoutPath);
    git(["push", "-u", "origin", branch], checkoutPath);
  } else if (!remoteBranchExists(checkoutPath, branch)) {
    git(["push", "-u", "origin", branch], checkoutPath);
  }

  const config = {
    version: 1,
    repositoryUrl,
    branch,
    machine,
    checkoutPath,
    maxBytes: MAX_BYTES
  };
  writeJson(configPath(), config);
  printResult({ configured: true, ...config, ...resultExtras, configPath: configPath() }, options.json);
}

function commandOnboard(options) {
  if (fs.existsSync(configPath())) {
    commandStatus(options);
    return;
  }
  const resolved = resolveDefaultGithubRepository();
  commandSetup([resolved.repositoryUrl], options, {
    onboarded: true,
    repositoryCreated: resolved.repositoryCreated,
    repositoryName: resolved.repositoryName
  });
}

function ensureCheckout(config) {
  if (!fs.existsSync(path.join(config.checkoutPath, ".git"))) {
    fail(`managed checkout is missing: ${config.checkoutPath}; run setup again`);
  }
}

function ensureClean(config) {
  const status = git(["status", "--porcelain"], config.checkoutPath).stdout;
  if (status) {
    fail(`managed checkout has uncommitted changes; inspect ${config.checkoutPath}`);
  }
}

function sync(config) {
  ensureCheckout(config);
  ensureClean(config);
  const fetchResult = git(["fetch", "origin", config.branch], config.checkoutPath, true);
  if (!fetchResult.ok) fail(redact(fetchResult.stderr || "could not fetch the share repository"));
  if (remoteBranchExists(config.checkoutPath, config.branch)) {
    const rebaseResult = git(
      ["rebase", `origin/${config.branch}`],
      config.checkoutPath,
      true
    );
    if (!rebaseResult.ok) {
      git(["rebase", "--abort"], config.checkoutPath, true);
      fail(redact(rebaseResult.stderr || "could not rebase the share repository"));
    }
  }
}

function validateArtifact(filePath, config) {
  const stat = fs.lstatSync(filePath);
  assertValid(!stat.isSymbolicLink(), "symbolic links cannot be published or fetched");
  assertValid(stat.isFile(), "only regular files can be published or fetched");
  if (stat.size > (config.maxBytes || MAX_BYTES)) {
    throw validationError(`file exceeds the ${Math.floor((config.maxBytes || MAX_BYTES) / 1024 / 1024)} MiB limit`);
  }
  const basename = path.basename(filePath);
  const extension = validateArtifactNamePolicy(basename);
  if (!extension && !SAFE_EXTENSIONLESS_NAMES.has(basename.toLowerCase())) {
    const sample = fs.readFileSync(filePath).subarray(0, 8192);
    if (sample.includes(0)) throw validationError("unsupported extensionless binary file");
  }
  if (TEXT_EXTENSIONS.has(extension) || !extension) {
    const content = fs.readFileSync(filePath, "utf8");
    if (SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content))) {
      throw validationError("refusing file containing a private-key or access-token signature");
    }
  }
  return stat;
}

function compactTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sha256(filePath) {
  return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function relativeArtifactPath(config, absolutePath) {
  return path.relative(config.checkoutPath, absolutePath).split(path.sep).join("/");
}

function readStagedPayload(config, relativePath) {
  const stageLine = git(
    ["ls-files", "--stage", "--", relativePath],
    config.checkoutPath
  ).stdout;
  const match = stageLine.match(/^(100644|100755) [0-9a-f]+ 0\t(.+)$/);
  assertValid(match && match[2] === relativePath, "staged artifact is not a regular Git blob");
  return gitBuffer(["show", `:${relativePath}`], config.checkoutPath).stdout;
}

function matchingLineEndingVariant(value, metadata) {
  const extension = path.extname(metadata.name).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension) && extension) return null;
  const text = value.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(value)) return null;

  const candidates = [
    Buffer.from(text.replace(/\r\n/g, "\n"), "utf8"),
    Buffer.from(text.replace(/\r?\n/g, "\r\n"), "utf8")
  ];
  return candidates.find(
    (candidate) => candidate.length === metadata.size && sha256Bytes(candidate) === metadata.sha256
  ) || null;
}

function verifyPayloadBuffer(value, metadata, config) {
  assertValid(Buffer.isBuffer(value), "artifact payload must be bytes");
  assertValid(value.length <= (config.maxBytes || MAX_BYTES), "artifact payload exceeds the configured limit");
  let verifiedValue = value;
  let legacyLineEndings = false;
  if (value.length !== metadata.size || sha256Bytes(value) !== metadata.sha256) {
    verifiedValue = matchingLineEndingVariant(value, metadata);
    assertValid(verifiedValue, "artifact content does not match metadata size/SHA-256");
    legacyLineEndings = true;
  }

  const extension = validateArtifactNamePolicy(metadata.name);
  if (!extension && !SAFE_EXTENSIONLESS_NAMES.has(metadata.name.toLowerCase())) {
    assertValid(!verifiedValue.subarray(0, 8192).includes(0), "unsupported extensionless binary file");
  }
  if (TEXT_EXTENSIONS.has(extension) || !extension) {
    const content = verifiedValue.toString("utf8");
    assertValid(
      !SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(content)),
      "refusing artifact containing a private-key or access-token signature"
    );
  }
  return { buffer: verifiedValue, legacyLineEndings };
}

function validateFetchedPayload(sourcePath, metadata, config) {
  const artifactsRoot = path.join(config.checkoutPath, "artifacts");
  const stat = fs.lstatSync(sourcePath);
  assertValid(!stat.isSymbolicLink(), "artifact payload cannot be a symbolic link");
  assertValid(stat.isFile(), "artifact payload must be a regular file");

  const realArtifactsRoot = fs.realpathSync(artifactsRoot);
  const realSourcePath = fs.realpathSync(sourcePath);
  assertValid(
    isPathInside(realArtifactsRoot, realSourcePath),
    "artifact payload resolves outside the managed artifacts directory"
  );
  validatePortableFileName(path.basename(sourcePath));
  const verified = verifyPayloadBuffer(fs.readFileSync(sourcePath), metadata, config);
  return { stat, ...verified };
}

function pushWithRetry(config) {
  let lastError = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const pushResult = git(
      ["push", "origin", `HEAD:${config.branch}`],
      config.checkoutPath,
      true
    );
    if (pushResult.ok) return;
    lastError = pushResult.stderr;
    const fetchResult = git(["fetch", "origin", config.branch], config.checkoutPath, true);
    if (!fetchResult.ok) break;
    const rebaseResult = git(
      ["rebase", `origin/${config.branch}`],
      config.checkoutPath,
      true
    );
    if (!rebaseResult.ok) {
      git(["rebase", "--abort"], config.checkoutPath, true);
      break;
    }
  }
  fail(
    `push failed after retries; the committed artifact remains in ${config.checkoutPath}: ${redact(lastError)}`
  );
}

function commandPublish(positionals, options) {
  const config = loadConfig();
  const sourceArgument = positionals[0];
  if (!sourceArgument) fail("usage: publish <file> [--note <text>]");
  const note = options.note || "";
  assertValid(
    typeof note === "string" && note.length <= MAX_NOTE_LENGTH,
    `artifact note must be at most ${MAX_NOTE_LENGTH} characters`
  );
  const sourcePath = path.resolve(sourceArgument);
  if (!fs.existsSync(sourcePath)) fail(`file not found: ${sourcePath}`);
  validateArtifact(sourcePath, config);
  sync(config);

  const createdAt = new Date();
  const id = `psh_${compactTimestamp(createdAt)}_${crypto.randomBytes(3).toString("hex")}`;
  const artifactDirectory = path.join(
    config.checkoutPath,
    "artifacts",
    config.machine,
    String(createdAt.getUTCFullYear()),
    String(createdAt.getUTCMonth() + 1).padStart(2, "0"),
    id
  );
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const destinationPath = path.join(artifactDirectory, path.basename(sourcePath));
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
  const relativePayloadPath = relativeArtifactPath(config, destinationPath);
  git(["add", "--", relativePayloadPath], config.checkoutPath);
  const stagedPayload = readStagedPayload(config, relativePayloadPath);

  const metadata = {
    version: 1,
    id,
    name: path.basename(sourcePath),
    machine: config.machine,
    createdAt: createdAt.toISOString(),
    size: stagedPayload.length,
    sha256: sha256Bytes(stagedPayload),
    note,
    relativePath: relativePayloadPath
  };
  const metadataPath = path.join(artifactDirectory, "artifact.json");
  validateArtifactMetadata(metadata, config, metadataPath);
  writeJson(metadataPath, metadata);
  const relativeDirectory = relativeArtifactPath(config, artifactDirectory);
  git(["add", "--", relativeDirectory], config.checkoutPath);
  git(["commit", "-m", `Share ${metadata.name} (${id})`], config.checkoutPath);
  pushWithRetry(config);
  printArtifact(metadata, config, options.json);
}

function collectArtifacts(config) {
  const artifactsRoot = path.join(config.checkoutPath, "artifacts");
  const found = [];
  if (!fs.existsSync(artifactsRoot)) return found;
  const stack = [artifactsRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name === "artifact.json") {
        try {
          const metadataStat = fs.lstatSync(entryPath);
          assertValid(metadataStat.size <= MAX_METADATA_BYTES, "artifact metadata file is too large");
          const metadata = JSON.parse(fs.readFileSync(entryPath, "utf8"));
          validateArtifactMetadata(metadata, config, entryPath);
          found.push(metadata);
        } catch (error) {
          fail(`invalid artifact metadata ${entryPath}: ${error.message}`);
        }
      }
    }
  }
  return found.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

function encodePath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function webBase(repositoryUrl) {
  const scpMatch = repositoryUrl.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2].replace(/\.git$/, "")}`;
  const sshMatch = repositoryUrl.match(/^ssh:\/\/(?:[^@]+@)?([^/]+)\/(.+)$/i);
  if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, "")}`;
  if (/^https?:\/\//i.test(repositoryUrl)) {
    const parsed = new URL(repositoryUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\.git$/, "").replace(/\/$/, "")}`;
  }
  return null;
}

function artifactWithLinks(metadata, config) {
  const base = webBase(config.repositoryUrl);
  if (!base) return { ...metadata, previewUrl: null, downloadUrl: null };
  const previewUrl = `${base}/blob/${encodePath(config.branch)}/${encodePath(metadata.relativePath)}`;
  return { ...metadata, previewUrl, downloadUrl: `${previewUrl}?raw=1` };
}

function printResult(value, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    process.stdout.write(`${key}: ${item}\n`);
  }
}

function printArtifact(metadata, config, json) {
  const result = artifactWithLinks(metadata, config);
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Shared: ${result.name}\n`);
  process.stdout.write(`ID: ${result.id}\n`);
  process.stdout.write(`Machine: ${result.machine}\n`);
  process.stdout.write(`Created: ${result.createdAt}\n`);
  if (result.previewUrl) {
    process.stdout.write(`Preview: ${result.previewUrl}\n`);
    process.stdout.write(`Download: ${result.downloadUrl}\n`);
  }
}

function commandList(options, latestOnly = false) {
  const config = loadConfig();
  sync(config);
  const parsedLimit = Number.parseInt(options.limit || (latestOnly ? "1" : "20"), 10);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    fail("--limit must be an integer from 1 to 200");
  }
  const artifacts = collectArtifacts(config).slice(0, parsedLimit);
  const results = artifacts.map((item) => artifactWithLinks(item, config));
  if (options.json) {
    process.stdout.write(`${JSON.stringify(latestOnly ? results[0] || null : results, null, 2)}\n`);
    return;
  }
  if (results.length === 0) {
    process.stdout.write("No shared artifacts.\n");
    return;
  }
  for (const result of results) {
    process.stdout.write(`${result.id}  ${result.createdAt}  ${result.machine}  ${result.name}\n`);
    if (result.previewUrl) process.stdout.write(`  Preview: ${result.previewUrl}\n`);
  }
}

function resolveArtifact(artifacts, selector) {
  if (selector === "latest") return artifacts[0] || null;
  const embeddedId = String(selector || "").match(/psh_[0-9TZ]+_[a-f0-9]{6}/i);
  const id = embeddedId ? embeddedId[0] : selector;
  return artifacts.find((item) => item.id === id) || null;
}

function commandFetch(positionals, options) {
  const config = loadConfig();
  const selector = positionals[0];
  if (!selector) fail("usage: fetch <artifact-id|latest> [--output <directory>] [--force]");
  sync(config);
  const metadata = resolveArtifact(collectArtifacts(config), selector);
  if (!metadata) fail(`artifact not found: ${selector}`);
  const sourcePath = resolveWithin(config.checkoutPath, metadata.relativePath, "artifact relative path");
  if (!fs.existsSync(sourcePath)) fail(`artifact payload is missing: ${metadata.relativePath}`);
  const verifiedPayload = validateFetchedPayload(sourcePath, metadata, config);

  const requestedOutput = path.resolve(options.output || process.cwd());
  let destinationPath = requestedOutput;
  if (fs.existsSync(requestedOutput) && fs.statSync(requestedOutput).isDirectory()) {
    destinationPath = resolveWithin(requestedOutput, metadata.name, "artifact destination name");
  } else if (!options.output) {
    destinationPath = resolveWithin(process.cwd(), metadata.name, "artifact destination name");
  }
  if (fs.existsSync(destinationPath)) {
    const destinationStat = fs.lstatSync(destinationPath);
    if (destinationStat.isSymbolicLink()) fail(`destination cannot be a symbolic link: ${destinationPath}`);
    if (!destinationStat.isFile()) fail(`destination is not a regular file: ${destinationPath}`);
    if (!options.force) {
      fail(`destination already exists: ${destinationPath}; use --force only with user approval`);
    }
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, verifiedPayload.buffer, { flag: options.force ? "w" : "wx" });
  const result = {
    ...artifactWithLinks(metadata, config),
    localPath: destinationPath,
    legacyLineEndings: verifiedPayload.legacyLineEndings
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`Fetched: ${metadata.id}\nLocal path: ${destinationPath}\n`);
    if (result.previewUrl) process.stdout.write(`Preview: ${result.previewUrl}\n`);
  }
}

function commandStatus(options) {
  const filePath = configPath();
  if (!fs.existsSync(filePath)) {
    const result = { configured: false, configPath: filePath };
    printResult(result, options.json);
    return;
  }
  const config = loadConfig();
  const result = {
    configured: true,
    repositoryUrl: redact(config.repositoryUrl),
    branch: config.branch,
    machine: config.machine,
    checkoutPath: config.checkoutPath,
    checkoutPresent: fs.existsSync(path.join(config.checkoutPath, ".git")),
    configPath: filePath
  };
  printResult(result, options.json);
}

function printHelp() {
  process.stdout.write(`Paseo Share\n\n`);
  process.stdout.write(`Usage:\n`);
  process.stdout.write(`  paseo-share.js onboard [--machine <name>] [--branch <name>] [--json]\n`);
  process.stdout.write(`  paseo-share.js setup <repo-url> [--machine <name>] [--branch <name>]\n`);
  process.stdout.write(`  paseo-share.js publish <file> [--note <text>] [--json]\n`);
  process.stdout.write(`  paseo-share.js list [--limit <number>] [--json]\n`);
  process.stdout.write(`  paseo-share.js latest [--json]\n`);
  process.stdout.write(`  paseo-share.js fetch <artifact-id|latest> [--output <path>] [--force] [--json]\n`);
  process.stdout.write(`  paseo-share.js status [--json]\n`);
}

function main() {
  const argv = process.argv.slice(2);
  // Top-level help must never touch config, Git, GitHub, or the filesystem.
  if (!argv.length || argv[0] === "help" || argv[0] === "--help") {
    printHelp();
    return;
  }
  const command = argv[0];
  const { positionals, options } = parseArgs(argv.slice(1));
  if (options.help) {
    printHelp();
    return;
  }
  switch (command) {
    case "onboard":
      commandOnboard(options);
      break;
    case "setup":
      commandSetup(positionals, options);
      break;
    case "publish":
      commandPublish(positionals, options);
      break;
    case "list":
      commandList(options, false);
      break;
    case "latest":
      commandList(options, true);
      break;
    case "fetch":
      commandFetch(positionals, options);
      break;
    case "status":
      commandStatus(options);
      break;
    default:
      fail(`unknown command: ${command}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fail(error && error.message ? error.message : String(error));
  }
}

module.exports = {
  ARTIFACT_ID_PATTERN,
  MAX_BYTES,
  isEmptyRepositoryResponse,
  isNotFoundResponse,
  isPathInside,
  parseCommandJson,
  resolveDefaultGithubRepository,
  resolveWithin,
  sha256,
  validateArtifactMetadata,
  validateDefaultRepositoryTree,
  validateFetchedPayload,
  validatePortableFileName
};
