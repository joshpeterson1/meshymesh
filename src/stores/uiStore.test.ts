import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "./uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedConnectionId: null,
      activeView: "conversations",
      unifiedView: "dashboard",
      selectedChannel: 0,
      sidebarCollapsed: false,
    });
  });

  it("starts with null selectedConnectionId", () => {
    expect(useUIStore.getState().selectedConnectionId).toBeNull();
  });

  describe("selectConnection", () => {
    it("sets selectedConnectionId and resets to conversations view", () => {
      useUIStore.getState().setActiveView("nodes");
      useUIStore.getState().selectConnection("conn-1");

      const state = useUIStore.getState();
      expect(state.selectedConnectionId).toBe("conn-1");
      expect(state.activeView).toBe("conversations");
    });

    it("allows deselecting with null", () => {
      useUIStore.getState().selectConnection("conn-1");
      useUIStore.getState().selectConnection(null);

      expect(useUIStore.getState().selectedConnectionId).toBeNull();
    });
  });

  describe("setActiveView", () => {
    it("changes the active view", () => {
      useUIStore.getState().setActiveView("settings");
      expect(useUIStore.getState().activeView).toBe("settings");
    });
  });

  describe("toggleSidebar", () => {
    it("toggles sidebar collapsed state", () => {
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    });
  });
});
