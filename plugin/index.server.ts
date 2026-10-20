import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getSkillStatus } from "./server/status";
import { skillStatusRpc } from "./shared/skills";

export default function contribute(server: PluginServerContext) {
  server.handle(skillStatusRpc, getSkillStatus);
  return () => {};
}
