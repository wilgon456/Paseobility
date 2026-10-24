import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { VersionScreen } from "./client/screen";
import { contributePills } from "./client/pills";
import { skillsSource } from "./shared/management";
function VersionItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Sparkles"
      active={currentScreen?.screenId === "skills"}
      onPress={() => openScreen({ screenId: "skills" })}
    />
  );
}
export default function contribute(client: PluginClientContext) {
  client.addScreen({
    id: "skills",
    title: "Paseobility",
    Component: VersionScreen,
  });
  client.addSidebarHeaderItem({
    id: "skills",
    title: "Paseobility",
    Component: VersionItem,
  });
  client.addAttachmentSource(skillsSource);
  return contributePills(client);
}
