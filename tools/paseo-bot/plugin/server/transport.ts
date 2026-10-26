import { spawn } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join, isAbsolute } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { z } from "zod";

const safePath = /^[a-zA-Z]:[\\/][a-zA-Z0-9 _./\\-]+\.ps1$/;
export const connectionSchema = z.object({
  // Tailnet-only address; no public IP, arbitrary SSH options or URL credentials.
  host: z.string().refine(s => /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3})\.(?:\d{1,3})$/.test(s) && s.split('.').every(n => +n < 256) || /^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.ts\.net$/.test(s)),
  user: z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/),
  bridge: z.string().regex(safePath), expectedHost: z.string().min(1),
  identityFile: z.string().refine(isAbsolute).optional(),
  knownHostsFile: z.string().refine(isAbsolute).optional(),
  allowSubmit: z.boolean().default(false),
}).strict();
export type Connection = z.infer<typeof connectionSchema>;
export function loadConnection(): Connection {
  const file = join(homedir(), ".config", "paseo-bot-gui", "connection.json");
  const st = lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || (process.platform !== "win32" && (st.mode & 0o077))) throw Error("private-config");
  return connectionSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
export function sshArgs(c: Connection, submit: boolean) {
  if (submit && !c.allowSubmit) throw Error("read-only");
  return ["-F", "none", "-T", "-o", "ClearAllForwardings=yes", "-o", "ForwardAgent=no", "-o", "PermitLocalCommand=no",
    "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8",
    "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2", "-o", "LogLevel=ERROR",
    ...(c.identityFile ? ["-o", "IdentitiesOnly=yes", "-i", c.identityFile] : []),
    ...(c.knownHostsFile ? ["-o", `UserKnownHostsFile=${c.knownHostsFile}`] : []),
    "--", `${c.user}@${c.host}`,
    `powershell.exe -NoLogo -NoProfile -NonInteractive -File "${c.bridge}"${c.allowSubmit ? " -AllowSubmit" : ""}`];
}
export const SAFE_ERROR = "VAXPORT 연결을 확인하세요. 제출 결과가 불명확하면 같은 작업 ID로 조회한 뒤 재시도하세요.";
export async function requestBridge(request: Record<string, unknown>, config = loadConnection(), runner = spawn): Promise<unknown> {
  const args = sshArgs(config, request.action === "submit");
  const payload = JSON.stringify(request);
  if (Buffer.byteLength(payload) > 200000) throw Error(SAFE_ERROR);
  return new Promise((resolve, reject) => {
    const child = runner("ssh", args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", bytes = 0, finished = false;
    const decoder = new StringDecoder("utf8");
    function fail() { if (finished) return; finished = true; clearTimeout(timer); child.kill(); reject(Error(SAFE_ERROR)); }
    const timer = setTimeout(fail, 25000);
    child.stdout.on("data", (b: Buffer) => { bytes += b.length; if (bytes > 2_000_000) fail(); else out += decoder.write(b); });
    child.stderr.resume(); // Never relay SSH/remote stderr, config, key paths or command text.
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.on("close", code => {
      if (finished) return;
      try {
        const data = JSON.parse(out + decoder.end());
        if (code !== 0 || data.ok !== true) return fail();
        if (request.action === "status" && data.result?.host?.toLowerCase() !== config.expectedHost.toLowerCase()) return fail();
        finished = true; clearTimeout(timer); resolve(data.result);
      } catch { fail(); }
    });
    child.stdin.end(payload, "utf8");
  });
}
