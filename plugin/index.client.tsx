import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { SkillsScreen } from "./client/screen";

function SkillsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Sparkles"
      active={currentScreen?.screenId === "skills"}
      onPress={() => openScreen({ screenId: "skills" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "skills", title: "Paseobility", Component: SkillsScreen });
  client.addSidebarHeaderItem({ id: "skills", title: "Paseobility", Component: SkillsItem });
  return () => {};
}
