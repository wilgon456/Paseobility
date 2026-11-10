// Detached because replacing the plugin ends its RPC process. No daemon restart.
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { treeDigest, run, installSkills, rollback } from "./update-core.mjs";
export async function updatePackage(options, execute = run) {
  const { stateDir, version, sha, home, daemonHome, cli, oldPlugin } = options;
  const lock = join(stateDir, "update.lock"),
    statePath = join(stateDir, "job.json");
  let changes = [],
    pluginAttempted = false,
    uncertain = false,
    replacement,
    preservedSource,
    restorePlugin = oldPlugin;
  const listPlugin = async () => JSON.parse(await execute(cli, [
    "plugin", "ls", "--home", daemonHome, "--json",
  ])).find((item) => item.id === "paseobility");
  const addPlugin = (directory) => execute(cli, [
    "plugin", "add", directory, "--id", "paseobility", "--home", daemonHome, "--json",
  ]);
  const removePlugin = () => execute(cli, [
    "plugin", "remove", "paseobility", "--home", daemonHome, "--json",
  ]);
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
  const interrupted = () => state(
    "interrupted",
    "jobUncertain",
    "Couldn't confirm the plugin switch. Nothing is retried automatically; check the backup and installation.",
  );
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
    replacement = join(source, "plugin");
    const original = await listPlugin();
    if (original?.path !== oldPlugin || original.status !== "running")
      throw Error("Installed plugin changed before update.");
    const kind = original.installation?.identity?.kind ?? original.source;
    if (kind === "git") {
      // Removing a managed Git plugin deletes its checkout. Preserve the whole
      // package (including local edits) before unregistering it, not just plugin/.
      if (basename(oldPlugin) !== "plugin") throw Error("Unexpected plugin package layout.");
      const oldRoot = dirname(oldPlugin), savedRoot = join(backup, "plugin-source");
      const digest = await treeDigest(oldRoot);
      await fs.cp(oldRoot, savedRoot, { recursive: true, errorOnExist: true, force: false });
      if (await treeDigest(savedRoot) !== digest || await treeDigest(oldRoot) !== digest)
        throw Error("Plugin source changed while backing up.");
      preservedSource = { root: oldRoot, digest };
      restorePlugin = join(savedRoot, "plugin");
    } else if (kind !== "directory") {
      throw Error("Cannot safely replace this plugin source type.");
    }
    await state(
      "running",
      "jobInstalling",
      "Backing up the current skills and installing the new version…",
    );
    changes = await installSkills(source, home, backup, ids);
    await state("running", "jobReconnecting", "Switching the plugin to the new version…");
    if ((await listPlugin())?.path !== oldPlugin)
      throw Error("Installed plugin changed before switching.");
    if (preservedSource && await treeDigest(preservedSource.root) !== preservedSource.digest)
      throw Error("Plugin source changed before switching; preserving it.");
    pluginAttempted = true;
    // add/install rejects an existing ID; it is not an upsert. Directory sources
    // survive remove; managed sources have the verified backup above.
    await removePlugin();
    await addPlugin(replacement);
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
        files: changes
          .filter((x) => !x.retired)
          .map((x) => ({ path: x.target, digest: x.digest })),
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
      await interrupted();
      return;
    }
    try {
      if (pluginAttempted) {
        const current = await listPlugin();
        if (current?.path === replacement) await removePlugin();
        else if (current && current.path !== oldPlugin)
          throw Error("Plugin changed during recovery; no registration was removed.");
        if (!current || current.path === replacement) await addPlugin(restorePlugin);
        const restored = await listPlugin();
        if (restored?.status !== "running" ||
            ![oldPlugin, restorePlugin].includes(restored.path))
          throw Error("Previous plugin did not recover.");
      }
      await rollback(changes);
      const detail = String(error.message);
      await state(
        "failed",
        "jobFailed",
        `Update failed. Check the backup and installation. ${detail}`,
        { detail },
      );
    } catch (recoveryError) {
      if (recoveryError.uncertain) {
        uncertain = true;
        await interrupted();
        return;
      }
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
