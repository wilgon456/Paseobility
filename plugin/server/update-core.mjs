// Detached because replacing the plugin ends its RPC process. No daemon restart.
import * as fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { createHash } from "node:crypto";
export async function treeDigest(root) {
  if ((await fs.lstat(root)).isSymbolicLink())
    throw Error("Symbolic link root is not supported.");
  const hash = createHash("sha256");
  async function walk(dir, relative = "") {
    for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    )) {
      const name = relative + item.name,
        path = join(dir, item.name);
      if (item.isSymbolicLink())
        throw Error("Symbolic links are not supported in an update tree.");
      if (item.isDirectory()) await walk(path, name + "/");
      else if (item.isFile()) {
        hash.update(name + "\0");
        hash.update(await fs.readFile(path));
        hash.update("\0");
      } else throw Error("Unsupported file in update tree.");
    }
  }
  await walk(root);
  return hash.digest("hex");
}
export function invocation(command, args, platform = process.platform) {
  if (platform !== "win32") return { command, args };
  const payload = Buffer.from(
    JSON.stringify({ command, args }),
    "utf8",
  ).toString("base64");
  const script = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))); $c=[string]$p.command; $a=@($p.args); & $c @a; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
  return {
    command: "powershell.exe",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
  };
}
export async function run(command, args, cwd, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const call = invocation(command, args);
    const child = spawn(call.command, call.args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      const error = Error("Update command timed out; completion is uncertain.");
      error.uncertain = true;
      reject(error);
    }, timeout);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 200000) output = output.slice(-200000);
    });
    child.stderr.on("data", () => {}); // Do not retain credentials or private paths from command errors.
    child.on("error", () => {
      clearTimeout(timer);
      reject(Error("Required update command could not start."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.trim())
        : reject(
            Error("Update command failed: " + command + " (exit " + code + ")"),
          );
    });
  });
}
export async function installSkills(source, home, backup, ids) {
  const changes = [];
  try {
    for (const owner of [".agents", ".claude"]) {
      const root = join(home, owner, "skills");
      if (owner === ".claude" && !(await fs.stat(root).catch(() => null)))
        continue;
      await fs.mkdir(root, { recursive: true });
      for (const id of ids) {
        if (!/^(?:ps|ps-[a-z0-9-]+)$/.test(id)) throw Error("Invalid skill name.");
        const from = join(source, "skills", id),
          target = join(root, id),
          saved = join(backup, owner, id);
        const digest = await treeDigest(from);
        await fs.access(join(from, "SKILL.md"));
        const exists = await fs.lstat(target).catch(() => null);
        if (exists?.isSymbolicLink())
          throw Error("A skill uses a symbolic link; update it manually.");
        await fs.mkdir(join(backup, owner), { recursive: true });
        const stageRoot = await fs.mkdtemp(join(root, `.${id}.paseobility-stage-`));
        const stage = join(stageRoot, "skill");
        try {
          await fs.cp(from, stage, {
            recursive: true,
            errorOnExist: true,
            force: false,
          });
          if ((await treeDigest(stage)) !== digest)
            throw Error("Staged skill verification failed.");
          if (exists) await fs.rename(target, saved);
          const change = {
            target,
            saved,
            existed: !!exists,
            digest,
            installed: false,
          };
          changes.push(change);
          await fs.rename(stage, target);
          change.installed = true;
        } finally {
          await fs.rm(stageRoot, { recursive: true, force: true });
        }
      }
      // v3.0.0 renamed paseo-<name> to ps-<name>. An old copy left beside the
      // new one would load both, so move a recognized old copy to the backup.
      // Links and directories that do not declare the old name are left alone.
      for (const id of ids) {
        if (id === "ps") continue; // The catalog has no paseo- predecessor.
        const legacy = "paseo-" + id.slice(3),
          target = join(root, legacy),
          saved = join(backup, owner, legacy);
        const found = await fs.lstat(target).catch(() => null);
        if (!found?.isDirectory()) continue;
        const manifest = join(target, "SKILL.md");
        if (!(await fs.lstat(manifest).catch(() => null))?.isFile()) continue;
        const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
          await fs.readFile(manifest, "utf8"),
        )?.[1];
        const name = /^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(header ?? "")?.[1];
        if (name !== legacy) continue;
        await fs.mkdir(join(backup, owner), { recursive: true });
        await fs.rename(target, saved);
        changes.push({ target, saved, existed: true, installed: false, retired: true });
      }
    }
    return changes;
  } catch (error) {
    await rollback(changes);
    throw error;
  }
}
export async function rollback(changes) {
  for (const change of [...changes].reverse()) {
    if (change.installed) {
      if ((await treeDigest(change.target)) !== change.digest)
        throw Error(
          "An installed skill changed during update; restore its backup manually.",
        );
      await fs.rm(change.target, { recursive: true });
    }
    if (change.existed) await fs.rename(change.saved, change.target);
  }
}
