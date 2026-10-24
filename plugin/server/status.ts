import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";
import { SKILLS } from "../shared/skills";

function installed(root: string, id: string): boolean {
  return existsSync(join(root, id, "SKILL.md"));
}

export function getSkillStatus() {
  const home = homedir();
  const paseoRoot = join(home, ".agents", "skills");
  const claudeRoot = join(home, ".claude", "skills");
  const os = platform();
  // Presence only: never launch a browser/driver or enumerate personal app data.
  const bins = [
    ...(process.env.PATH ?? "").split(delimiter).filter(Boolean),
    join(home, ".local", "bin"),
    join(home, ".cua-driver", "bin"),
  ];
  const binary = (name: string) =>
    bins.some(
      (dir) =>
        existsSync(join(dir, name)) ||
        (os === "win32" && existsSync(join(dir, `${name}.exe`))),
    );
  return {
    platform: os,
    tools: [
      { id: "ego", label: "Ego Lite CLI", detected: binary("ego-browser") },
      {
        id: "cua",
        label: "Cua Driver",
        detected:
          binary("cua-driver") ||
          (os === "darwin" && existsSync("/Applications/CuaDriver.app")),
      },
    ],
    skills: SKILLS.map(({ id }) => ({
      id,
      paseo: installed(paseoRoot, id),
      claude: installed(claudeRoot, id),
    })),
  };
}
