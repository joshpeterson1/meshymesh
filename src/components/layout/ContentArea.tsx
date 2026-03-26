import { useUIStore } from "@/stores/uiStore";
import { ConversationsView } from "@/components/views/ConversationsView";
import { NodesView } from "@/components/views/NodesView";
import { MapView } from "@/components/views/MapView";
import { SettingsView } from "@/components/views/SettingsView";

export function ContentArea() {
  const activeView = useUIStore((s) => s.activeView);

  switch (activeView) {
    case "conversations":
      return <ConversationsView />;
    case "nodes":
      return <NodesView />;
    case "map":
      return <MapView />;
    case "settings":
      return <SettingsView />;
    default:
      return <ConversationsView />;
  }
}
