import { describe, it, expect, beforeEach } from "vitest";
import { useNodeStore } from "./nodeStore";
import type { NodeConnection, MeshMessage, MeshNode, MeshChannel } from "./types";

function makeConnection(overrides: Partial<NodeConnection> = {}): NodeConnection {
  return {
    id: "conn-1",
    label: "Test Node",
    transport: "serial",
    transportAddress: "COM3",
    status: "connected",
    channels: [],
    meshNodes: {},
    messages: [],
    deviceConfigs: {},
    lastActivity: 0,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MeshMessage> = {}): MeshMessage {
  return {
    id: "msg-1",
    from: 0x1234,
    to: 0xffffffff,
    channel: 0,
    text: "Hello mesh",
    timestamp: 1000,
    ackStatus: "none",
    ...overrides,
  };
}

function makeNode(overrides: Partial<MeshNode> = {}): MeshNode {
  return {
    num: 0x1234,
    user: {
      id: "!1234",
      longName: "Test Node",
      shortName: "TN",
      hwModel: "HELTEC_V3",
      role: "CLIENT",
      hasPublicKey: false,
    },
    snr: 10,
    lastHeard: 1000,
    hopsAway: 0,
    viaMqtt: false,
    isFavorite: false,
    ...overrides,
  };
}

describe("nodeStore", () => {
  beforeEach(() => {
    // Reset store to empty state
    useNodeStore.setState({ connections: {}, connectionOrder: [] });
  });

  describe("addConnection", () => {
    it("adds a connection and updates order", () => {
      const conn = makeConnection();
      useNodeStore.getState().addConnection(conn);

      const state = useNodeStore.getState();
      expect(state.connections["conn-1"]).toBeDefined();
      expect(state.connections["conn-1"].label).toBe("Test Node");
      expect(state.connectionOrder).toEqual(["conn-1"]);
    });

    it("adds multiple connections in order", () => {
      useNodeStore.getState().addConnection(makeConnection({ id: "a" }));
      useNodeStore.getState().addConnection(makeConnection({ id: "b" }));

      expect(useNodeStore.getState().connectionOrder).toEqual(["a", "b"]);
    });
  });

  describe("addSkeletonConnection", () => {
    it("creates a skeleton with default fields", () => {
      useNodeStore.getState().addSkeletonConnection("sk-1", "Skeleton", "serial", "COM5");

      const conn = useNodeStore.getState().connections["sk-1"];
      expect(conn).toBeDefined();
      expect(conn.label).toBe("Skeleton");
      expect(conn.transport).toBe("serial");
      expect(conn.transportAddress).toBe("COM5");
      expect(conn.status).toBe("connecting");
      expect(conn.messages).toEqual([]);
      expect(conn.channels).toEqual([]);
    });

    it("does not duplicate in connectionOrder", () => {
      useNodeStore.getState().addSkeletonConnection("sk-1", "Skeleton", "serial", "COM5");
      useNodeStore.getState().addSkeletonConnection("sk-1", "Updated", "serial", "COM5");

      expect(useNodeStore.getState().connectionOrder).toEqual(["sk-1"]);
      expect(useNodeStore.getState().connections["sk-1"].label).toBe("Updated");
    });
  });

  describe("removeConnection", () => {
    it("removes connection and its order entry", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().removeConnection("conn-1");

      const state = useNodeStore.getState();
      expect(state.connections["conn-1"]).toBeUndefined();
      expect(state.connectionOrder).toEqual([]);
    });
  });

  describe("updateConnectionStatus", () => {
    it("updates status on existing connection", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().updateConnectionStatus("conn-1", "disconnected", "Lost signal");

      const conn = useNodeStore.getState().connections["conn-1"];
      expect(conn.status).toBe("disconnected");
      expect(conn.errorMessage).toBe("Lost signal");
    });

    it("creates skeleton for unknown connection", () => {
      useNodeStore.getState().updateConnectionStatus("unknown-1", "connecting");

      const conn = useNodeStore.getState().connections["unknown-1"];
      expect(conn).toBeDefined();
      expect(conn.status).toBe("connecting");
      expect(conn.label).toBe("Connecting...");
    });
  });

  describe("addMessage", () => {
    it("adds a message to the connection", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage());

      const messages = useNodeStore.getState().connections["conn-1"].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe("Hello mesh");
    });

    it("deduplicates messages by ID", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "dup-1" }));
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "dup-1", text: "Duplicate" }));

      const messages = useNodeStore.getState().connections["conn-1"].messages;
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe("Hello mesh");
    });

    it("allows different message IDs", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "a" }));
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "b" }));

      expect(useNodeStore.getState().connections["conn-1"].messages).toHaveLength(2);
    });

    it("ignores messages for unknown connections", () => {
      useNodeStore.getState().addMessage("nonexistent", makeMessage());
      expect(useNodeStore.getState().connections["nonexistent"]).toBeUndefined();
    });

    it("updates lastActivity", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage({ timestamp: 5000 }));

      expect(useNodeStore.getState().connections["conn-1"].lastActivity).toBe(5000);
    });
  });

  describe("updateMessageAck", () => {
    it("updates ack status on matching message", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "ack-1" }));
      useNodeStore.getState().updateMessageAck("conn-1", "ack-1", "acked");

      const msg = useNodeStore.getState().connections["conn-1"].messages[0];
      expect(msg.ackStatus).toBe("acked");
    });
  });

  describe("remapMessageId", () => {
    it("remaps local ID to packet ID", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().addMessage("conn-1", makeMessage({ id: "local-123" }));
      useNodeStore.getState().remapMessageId("conn-1", "local-123", "42");

      const messages = useNodeStore.getState().connections["conn-1"].messages;
      expect(messages[0].id).toBe("42");
    });
  });

  describe("upsertMeshNode", () => {
    it("adds a new node", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().upsertMeshNode("conn-1", makeNode());

      const nodes = useNodeStore.getState().connections["conn-1"].meshNodes;
      expect(nodes[0x1234]).toBeDefined();
      expect(nodes[0x1234].user.longName).toBe("Test Node");
    });

    it("updates existing node", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().upsertMeshNode("conn-1", makeNode());
      useNodeStore.getState().upsertMeshNode("conn-1", makeNode({ snr: 5 }));

      expect(useNodeStore.getState().connections["conn-1"].meshNodes[0x1234].snr).toBe(5);
    });
  });

  describe("setChannels", () => {
    it("sets channels on connection", () => {
      useNodeStore.getState().addConnection(makeConnection());
      const channels: MeshChannel[] = [
        { index: 0, name: "LongFast", role: "primary", psk: [1], uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 32, isClientMuted: false },
      ];
      useNodeStore.getState().setChannels("conn-1", channels);

      expect(useNodeStore.getState().connections["conn-1"].channels).toHaveLength(1);
      expect(useNodeStore.getState().connections["conn-1"].channels[0].name).toBe("LongFast");
    });
  });

  describe("setDeviceConfig", () => {
    it("stores config by type", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().setDeviceConfig("conn-1", "lora", { region: 1 });

      expect(useNodeStore.getState().connections["conn-1"].deviceConfigs["lora"]).toEqual({ region: 1 });
    });
  });

  describe("updateBattery", () => {
    it("updates battery level and voltage", () => {
      useNodeStore.getState().addConnection(makeConnection());
      useNodeStore.getState().updateBattery("conn-1", 85, 4.1);

      const conn = useNodeStore.getState().connections["conn-1"];
      expect(conn.batteryLevel).toBe(85);
      expect(conn.voltage).toBe(4.1);
    });
  });
});
