import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SKILLS } from "../shared/skills";

function installed(root: string, id: string): boolean {
  return existsSync(join(root, id, "SKILL.md"));
}

export function getSkillStatus() {
  const home = homedir();
  const paseoRoot = join(home, ".agents", "skills");
  const claudeRoot = join(home, ".claude", "skills");
  return {
    skills: SKILLS.map(({ id }) => ({
      id,
      paseo: installed(paseoRoot, id),
      claude: installed(claudeRoot, id),
    })),
  };
}
