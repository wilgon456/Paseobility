// Detached because replacing the plugin ends its RPC process. No daemon restart.
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { treeDigest, run, installSkills, rollback } from "./update-core.mjs";
export async function updatePackage(options, execute = run) {
  const { stateDir, version, sha, home, daemonHome, cli, oldPlugin } = options;
  const lock = join(stateDir, "update.lock"),
    statePath = join(stateDir, "job.json");
  let changes = [],
    pluginAttempted = false,
    uncertain = false;
  const backup = join(
    home,
    ".agents",
    "skills-backups",
    `Paseobility-${version}-${Date.now()}`,
  );
  const state = async (phase, message) => {
    const tmp = statePath + ".tmp";
    await fs.writeFile(
      tmp,
      JSON.stringify({ phase, message, backup, pid: process.pid }),
    );
    await fs.rename(tmp, statePath);
  };
  try {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !/^([0-9a-f]{40})$/.test(sha))
      throw Error("Invalid release.");
    await state("running", `v${version} 다운로드 및 검증 중`);
    const source = await fs.mkdtemp(join(stateDir, "release-"));
    await execute("git", ["init", "--quiet", source]);
    await execute("git", [
      "-C",
      source,
      "fetch",
      "--depth",
      "1",
      "https://github.com/wilgon456/Paseobility.git",
      sha,
    ]);
    await execute("git", ["-C", source, "checkout", "--detach", "FETCH_HEAD"]);
    if ((await execute("git", ["-C", source, "rev-parse", "HEAD"])) !== sha)
      throw Error("Release SHA mismatch.");
    if ((await fs.readFile(join(source, "VERSION"), "utf8")).trim() !== version)
      throw Error("Release version mismatch.");
    const manifest = JSON.parse(
      await fs.readFile(join(source, "plugin", "paseo-plugin.json"), "utf8"),
    );
    const pkg = JSON.parse(
      await fs.readFile(join(source, "plugin", "package.json"), "utf8"),
    );
    if (manifest.id !== "paseobility" || pkg.version !== version)
      throw Error("Plugin release mismatch.");
    const ids = (
      await fs.readdir(join(source, "skills"), { withFileTypes: true })
    )
      .filter((x) => x.isDirectory())
      .map((x) => x.name)
      .sort();
    if (!ids.length) throw Error("No skills in release.");
    await treeDigest(join(source, "skills"));
    await state("running", "기존 스킬을 백업하고 새 버전을 설치하고 있습니다.");
    changes = await installSkills(source, home, backup, ids);
    await state("running", "플러그인을 새 버전으로 다시 연결하고 있습니다.");
    pluginAttempted = true;
    await execute(cli, [
      "plugin",
      "add",
      join(source, "plugin"),
      "--id",
      "paseobility",
      "--home",
      daemonHome,
      "--json",
    ]);
    const plugins = JSON.parse(
      await execute(cli, ["plugin", "ls", "--home", daemonHome, "--json"]),
    );
    if (
      !plugins.some(
        (x) =>
          x.id === "paseobility" &&
          x.status === "running" &&
          x.path === join(source, "plugin"),
      )
    )
      throw Error("New plugin did not start.");
    await fs.writeFile(
      join(stateDir, "installed.json"),
      JSON.stringify({
        version,
        sha,
        files: changes.map((x) => ({ path: x.target, digest: x.digest })),
      }),
    );
    await state(
      "complete",
      `v${version} 업데이트 완료. 새 대화에서 갱신된 스킬을 사용할 수 있습니다.`,
    );
  } catch (error) {
    if (pluginAttempted && error.uncertain) {
      uncertain = true;
      await state(
        "interrupted",
        "플러그인 교체 결과를 확인하지 못했습니다. 자동 재시도하지 않으며 백업과 설치 상태 확인이 필요합니다.",
      );
      return;
    }
    try {
      if (pluginAttempted)
        await execute(cli, [
          "plugin",
          "add",
          oldPlugin,
          "--id",
          "paseobility",
          "--home",
          daemonHome,
          "--json",
        ]);
      await rollback(changes);
      await state(
        "failed",
        "업데이트 실패. 백업과 설치 상태를 확인해주세요. " +
          String(error.message),
      );
    } catch {
      await state(
        "failed",
        "업데이트가 중단되어 자동 복구하지 못했습니다. 백업 경로를 확인해주세요.",
      );
    }
  } finally {
    if (!uncertain) await fs.rm(lock, { force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await updatePackage(JSON.parse(process.argv[2]));
