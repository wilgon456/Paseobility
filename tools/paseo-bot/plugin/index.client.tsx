import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { BotScreen } from "./client/screen";
function Item({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="Bot" active={currentScreen?.screenId === "queue"} onPress={() => openScreen({ screenId: "queue" })} />;
}
export default function contribute(client: PluginClientContext) {
  const removeScreen = client.addScreen({ id: "queue", title: "Paseo 봇", Component: BotScreen });
  const removeItem = client.addSidebarHeaderItem({ id: "queue", title: "Paseo 봇", Component: Item });
  return () => { removeItem(); removeScreen(); };
}
