import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getSkillStatus } from "./server/status";
import { packageStatus, startUpdate } from "./server/management";
import { skillStatusRpc } from "./shared/skills";
import { versionRpc, updateRpc, skillsSearchRpc } from "./shared/management";
import { WORKFLOWS } from "./shared/workflows";
export default function contribute(server: PluginServerContext) {
  server.handle(skillStatusRpc, getSkillStatus);
  server.handle(versionRpc, packageStatus);
  server.handle(updateRpc, startUpdate);
  server.handle(skillsSearchRpc, ({ query }) => {
    const installed = getSkillStatus().skills;
    return {
      items: WORKFLOWS.filter((x) =>
        installed.some((i) => i.id === x.id && (i.paseo || i.claude)),
      )
        .filter((x) =>
          (x.title + " " + x.id).toLowerCase().includes(query.toLowerCase()),
        )
        .map((x) => ({
          id: x.id,
          identifier: "/" + x.id,
          title: x.title,
          subtitle: x.hint,
          url:
            "https://github.com/wilgon456/Paseobility/tree/main/skills/" + x.id,
          text: `Use the installed /${x.id} skill for the user's request. Read its SKILL.md before acting.`,
          resourceType: "Paseobility skill",
        })),
    };
  });
  return () => {};
}
