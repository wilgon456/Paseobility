import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import { PLUGIN_VERSION } from "../shared/management";
import { MESSAGES } from "../shared/messages";
import { resolvePaseoCli } from "./cli-path";
import { treeDigest, run } from "./update-core.mjs";
const home = homedir();
const stateDir = join(home, ".paseobility", "updates");
async function command(args: string[]) {
  return JSON.parse(await run(resolvePaseoCli(), args, undefined, 15000));
}
async function identity(hostId: string) {
  const status = await command(["daemon", "status", "--json"]);
  if (status.serverId !== hostId || status.connectedDaemon !== "reachable")
    throw Error(MESSAGES.en.errHostUnreachable);
  return status;
}
async function json(path: string) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}
let releaseCache: {
  at: number;
  value: { version: string; sha: string; url: string };
} | null = null;
async function latest(force = false) {
  if (!force && releaseCache && Date.now() - releaseCache.at < 60000)
    return releaseCache.value;
  const get = async (path: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let r;
    try {
      r = await fetch(
        "https://api.github.com/repos/wilgon456/Paseobility/" + path,
        {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) throw Error(MESSAGES.en.errLatestFetch);
    return r.json();
  };
  const release = await get("releases/latest");
  if (
    release.draft ||
    release.prerelease ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
  )
    throw Error(MESSAGES.en.errReleaseInfo);
  const commit = await get("commits/" + release.tag_name);
  if (!/^[0-9a-f]{40}$/.test(commit.sha))
    throw Error(MESSAGES.en.errReleaseCommit);
  const value = {
    version: release.tag_name.slice(1),
    sha: commit.sha,
    url:
      "https://github.com/wilgon456/Paseobility/releases/tag/" +
      release.tag_name,
  };
  releaseCache = { at: Date.now(), value };
  return value;
}
function newer(a: string, b: string) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  return (x[0] - y[0] || x[1] - y[1] || x[2] - y[2]) > 0;
}
export async function packageStatus({ hostId }: { hostId: string }) {
  await identity(hostId);
  let installed: string | null = null;
  const receipt = await json(join(stateDir, "installed.json"));
  if (receipt?.files?.length) {
    try {
      for (const item of receipt.files) {
        if ((await treeDigest(item.path)) !== item.digest)
          throw Error("changed");
      }
      installed = receipt.version;
    } catch {
      /* Report unknown if files changed after receipt. */
    }
  }
  let release = null,
    error = null;
  try {
    release = await latest();
  } catch (e) {
    error = e instanceof Error ? e.message : MESSAGES.en.errVersionCheck;
  }
  let job = await json(join(stateDir, "job.json"));
  if (job?.phase === "running") {
    const workerPid =
      job.pid ?? (await json(join(stateDir, "update.lock")))?.pid;
    try {
      if (!workerPid) throw Error("worker unavailable");
      process.kill(workerPid, 0);
    } catch {
      job = {
        ...job,
        phase: "interrupted",
        code: "jobStalled",
        message: MESSAGES.en.jobStalled,
      };
    }
  }
  return { plugin: PLUGIN_VERSION, installed, latest: release, error, job };
}
export async function startUpdate(input: {
  hostId: string;
  version: string;
  sha: string;
}) {
  const daemon = await identity(input.hostId),
    release = await latest(true);
  if (input.version !== release.version || input.sha !== release.sha)
    throw Error(MESSAGES.en.errReleaseChanged);
  if (!newer(release.version, PLUGIN_VERSION))
    throw Error(MESSAGES.en.errNotNewer);
  const plugins = await command([
    "plugin",
    "ls",
    "--home",
    daemon.home,
    "--json",
  ]);
  const plugin = plugins.find((x: { id: string }) => x.id === "paseobility");
  if (!plugin?.path) throw Error(MESSAGES.en.errPluginPath);
  // Read the reviewed worker from this installed bundle, not the downloaded release.
  const core = await fs.readFile(
    join(plugin.path, "server", "update-core.mjs"),
  );
  const worker = await fs.readFile(
    join(plugin.path, "server", "update-worker.mjs"),
  );
  await fs.mkdir(stateDir, { recursive: true });
  const lock = join(stateDir, "update.lock");
  let file;
  try {
    file = await fs.open(lock, "wx");
  } catch {
    throw Error(MESSAGES.en.errUpdateLocked);
  }
  await file.close();
  try {
    const workerPath = join(stateDir, "worker.mjs");
    await fs.writeFile(join(stateDir, "update-core.mjs"), core);
    await fs.writeFile(workerPath, worker);
    const options = {
      stateDir,
      version: release.version,
      sha: release.sha,
      home,
      daemonHome: daemon.home,
      cli: resolvePaseoCli(),
      oldPlugin: plugin.path,
    };
    await fs.writeFile(
      join(stateDir, "job.json"),
      JSON.stringify({
        phase: "running",
        code: "jobStarting",
        message: MESSAGES.en.jobStarting,
      }),
    );
    const child = spawn(
      process.execPath,
      [workerPath, JSON.stringify(options)],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    // The worker owns job.json; a separate PID in the lock covers bootstrap failures.
    const lockHandle = await fs.open(lock, "r+").catch(() => null);
    if (lockHandle) {
      await lockHandle
        .writeFile(JSON.stringify({ pid: child.pid }))
        .catch(() => undefined);
      await lockHandle.close().catch(() => undefined);
    }
    child.unref();
    return { started: true };
  } catch (e) {
    await fs.writeFile(
      join(stateDir, "job.json"),
      JSON.stringify({
        phase: "failed",
        code: "jobStartFailed",
        message: MESSAGES.en.jobStartFailed,
      }),
    );
    await fs.rm(lock, { force: true });
    throw e;
  }
}
