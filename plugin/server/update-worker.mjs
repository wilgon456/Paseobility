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
  // English text plus a message code; the screen shows the code in the app
  // language. This file runs standalone, so it cannot import shared/messages.ts;
  // a test keeps each text equal to MESSAGES.en[code].
  const state = async (phase, code, message, values) => {
    const tmp = statePath + ".tmp";
    await fs.writeFile(
      tmp,
      JSON.stringify({ phase, code, values, message, backup, pid: process.pid }),
    );
    await fs.rename(tmp, statePath);
  };
  try {
    if (!/^\d+\.\d+\.\d+$/.test(version) || !/^([0-9a-f]{40})$/.test(sha))
      throw Error("Invalid release.");
    await state("running", "jobDownloading", `Downloading and verifying v${version}…`, { version });
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
    await state(
      "running",
      "jobInstalling",
      "Backing up the current skills and installing the new version…",
    );
    changes = await installSkills(source, home, backup, ids);
    await state("running", "jobReconnecting", "Switching the plugin to the new version…");
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
      "jobComplete",
      `Updated to v${version}. New conversations use the updated skills.`,
      { version },
    );
  } catch (error) {
    if (pluginAttempted && error.uncertain) {
      uncertain = true;
      await state(
        "interrupted",
        "jobUncertain",
        "Couldn't confirm the plugin switch. Nothing is retried automatically; check the backup and installation.",
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
      const detail = String(error.message);
      await state(
        "failed",
        "jobFailed",
        `Update failed. Check the backup and installation. ${detail}`,
        { detail },
      );
    } catch {
      await state(
        "failed",
        "jobUnrecovered",
        "The update stopped and couldn't roll back automatically. Check the backup folder.",
      );
    }
  } finally {
    if (!uncertain) await fs.rm(lock, { force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await updatePackage(JSON.parse(process.argv[2]));
