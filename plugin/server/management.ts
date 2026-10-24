import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import * as fs from "node:fs/promises";
import { PLUGIN_VERSION } from "../shared/management";
import { treeDigest, run } from "./update-core.mjs";
const home = homedir();
const stateDir = join(home, ".paseobility", "updates");
const cli =
  process.platform === "darwin"
    ? "/Applications/Paseo.app/Contents/Resources/bin/paseo"
    : "paseo";
async function command(args: string[]) {
  return JSON.parse(await run(cli, args, undefined, 15000));
}
async function identity(hostId: string) {
  const status = await command(["daemon", "status", "--json"]);
  if (status.serverId !== hostId || status.connectedDaemon !== "reachable")
    throw Error("선택한 컴퓨터의 Paseo 연결을 확인하지 못했습니다.");
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
    if (!r.ok) throw Error("GitHub에서 최신 버전을 확인하지 못했습니다.");
    return r.json();
  };
  const release = await get("releases/latest");
  if (
    release.draft ||
    release.prerelease ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
  )
    throw Error("정식 릴리스 정보를 확인하지 못했습니다.");
  const commit = await get("commits/" + release.tag_name);
  if (!/^[0-9a-f]{40}$/.test(commit.sha))
    throw Error("릴리스 커밋을 확인하지 못했습니다.");
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
    error = e instanceof Error ? e.message : "버전 확인 실패";
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
        message:
          "업데이트 작업이 중단되었습니다. 백업을 확인한 뒤 복구가 필요합니다.",
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
    throw Error("최신 릴리스가 바뀌었습니다. 버전을 새로고침해주세요.");
  if (!newer(release.version, PLUGIN_VERSION))
    throw Error("현재 버전 이하로 업데이트하지 않습니다.");
  const plugins = await command([
    "plugin",
    "ls",
    "--home",
    daemon.home,
    "--json",
  ]);
  const plugin = plugins.find((x: { id: string }) => x.id === "paseobility");
  if (!plugin?.path) throw Error("현재 플러그인 경로를 확인하지 못했습니다.");
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
    throw Error(
      "업데이트가 이미 진행 중이거나 중단된 기록이 있습니다. 상태를 확인해주세요.",
    );
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
      cli,
      oldPlugin: plugin.path,
    };
    await fs.writeFile(
      join(stateDir, "job.json"),
      JSON.stringify({
        phase: "running",
        message: "업데이트를 시작하고 있습니다.",
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
        message: "업데이트 작업을 시작하지 못했습니다.",
      }),
    );
    await fs.rm(lock, { force: true });
    throw e;
  }
}
