import { useUIStore } from "@/stores/uiStore";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ConversationsView } from "@/components/views/ConversationsView";
import { NodesView } from "@/components/views/NodesView";
import { MapView } from "@/components/views/MapView";
import { SettingsView } from "@/components/views/SettingsView";

export function ContentArea() {
  const activeView = useUIStore((s) => s.activeView);

  switch (activeView) {
    case "conversations":
      return <ErrorBoundary fallbackLabel="Conversations" key="conversations"><ConversationsView /></ErrorBoundary>;
    case "nodes":
      return <ErrorBoundary fallbackLabel="Nodes" key="nodes"><NodesView /></ErrorBoundary>;
    case "map":
      return <ErrorBoundary fallbackLabel="Map" key="map"><MapView /></ErrorBoundary>;
    case "settings":
      return <ErrorBoundary fallbackLabel="Settings" key="settings"><SettingsView /></ErrorBoundary>;
    default:
      return <ErrorBoundary fallbackLabel="Conversations" key="conversations"><ConversationsView /></ErrorBoundary>;
  }
}
