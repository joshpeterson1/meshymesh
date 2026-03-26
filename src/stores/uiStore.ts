import { create } from "zustand";
import type { SidebarView, UnifiedView } from "./types";

interface UIStoreState {
  selectedConnectionId: string | null;
  activeView: SidebarView;
  unifiedView: UnifiedView;
  selectedChannel: number;
  sidebarCollapsed: boolean;

  selectConnection: (id: string | null) => void;
  setActiveView: (view: SidebarView) => void;
  setUnifiedView: (view: UnifiedView) => void;
  selectChannel: (channel: number) => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  selectedConnectionId: null,
  activeView: "conversations",
  unifiedView: "dashboard",
  selectedChannel: 0,
  sidebarCollapsed: false,

  selectConnection: (id) =>
    set({
      selectedConnectionId: id,
      activeView: "conversations",
    }),
  setActiveView: (view) => set({ activeView: view }),
  setUnifiedView: (view) => set({ unifiedView: view }),
  selectChannel: (channel) => set({ selectedChannel: channel }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));
