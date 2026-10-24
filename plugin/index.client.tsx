import type {
  PluginClientContext,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { VersionScreen } from "./client/screen";
import { contributePills } from "./client/pills";
import { paseoLabels } from "./client/i18n";
import { createSkillsSource } from "./shared/management";
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
  const labels = paseoLabels(client);
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
  client.addAttachmentSource(
    createSkillsSource({
      title: labels.attachmentTitle,
      pickerTitle: labels.attachmentPickerTitle,
      searchPlaceholder: labels.attachmentSearchPlaceholder,
    }),
  );
  client.addCommandCenterItem({
    id: "skills",
    title: labels.commandCenterTitle,
    icon: "Sparkles",
    keywords: [
      "Paseobility",
      "skills",
      "version",
      "update",
      "스킬",
      "버전",
      "업데이트",
    ],
    context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: "skills" }),
  });
  return contributePills(client);
}
