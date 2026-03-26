import type { NodeConnection, MeshNode, MeshMessage } from "@/stores/types";

const now = Math.floor(Date.now() / 1000);

const homeBaseNodes: Record<number, MeshNode> = {
  0xaabbcc01: {
    num: 0xaabbcc01,
    user: { id: "!aabbcc01", longName: "Home Base", shortName: "HB01", hwModel: "HELTEC_V3", role: "CLIENT" },
    position: { latitude: 39.7392, longitude: -104.9903, altitude: 1609, time: now - 60 },
    snr: 12.5, lastHeard: now - 30, hopsAway: 0, batteryLevel: 98, voltage: 4.15, viaMqtt: false, isFavorite: false,
  },
  0xaabbcc02: {
    num: 0xaabbcc02,
    user: { id: "!aabbcc02", longName: "Hilltop Relay", shortName: "HR02", hwModel: "TBEAM", role: "ROUTER" },
    position: { latitude: 39.7452, longitude: -104.9813, altitude: 1720, time: now - 120 },
    snr: 8.0, lastHeard: now - 90, hopsAway: 1, batteryLevel: 76, voltage: 3.92, viaMqtt: false, isFavorite: false,
  },
  0xaabbcc03: {
    num: 0xaabbcc03,
    user: { id: "!aabbcc03", longName: "Park Node", shortName: "PK03", hwModel: "HELTEC_V3", role: "CLIENT" },
    position: { latitude: 39.7312, longitude: -104.9983, altitude: 1590, time: now - 300 },
    snr: 4.5, lastHeard: now - 180, hopsAway: 2, batteryLevel: 54, voltage: 3.71, viaMqtt: false, isFavorite: false,
  },
  0xaabbcc04: {
    num: 0xaabbcc04,
    user: { id: "!aabbcc04", longName: "Downtown East", shortName: "DE04", hwModel: "RAK4631", role: "CLIENT" },
    position: { latitude: 39.7422, longitude: -104.9723, altitude: 1600, time: now - 600 },
    snr: 2.0, lastHeard: now - 450, hopsAway: 2, viaMqtt: false, isFavorite: false,
  },
  0xaabbcc05: {
    num: 0xaabbcc05,
    user: { id: "!aabbcc05", longName: "MQTT Bridge", shortName: "MQ05", hwModel: "TBEAM", role: "CLIENT_MUTE" },
    snr: 0, lastHeard: now - 900, hopsAway: 3, viaMqtt: true, isFavorite: false,
  },
};

const mobileNodes: Record<number, MeshNode> = {
  0xddee0001: {
    num: 0xddee0001,
    user: { id: "!ddee0001", longName: "Mobile Node", shortName: "MB01", hwModel: "TBEAM", role: "CLIENT" },
    position: { latitude: 39.7502, longitude: -105.0003, altitude: 1650, time: now - 15 },
    snr: 10.0, lastHeard: now - 10, hopsAway: 0, batteryLevel: 72, voltage: 3.88, viaMqtt: false, isFavorite: false,
  },
  0xddee0002: {
    num: 0xddee0002,
    user: { id: "!ddee0002", longName: "Trail Marker A", shortName: "TA02", hwModel: "HELTEC_V3", role: "ROUTER" },
    position: { latitude: 39.7562, longitude: -105.0103, altitude: 1800, time: now - 200 },
    snr: 6.5, lastHeard: now - 120, hopsAway: 1, batteryLevel: 89, voltage: 4.05, viaMqtt: false, isFavorite: false,
  },
  0xddee0003: {
    num: 0xddee0003,
    user: { id: "!ddee0003", longName: "Summit Repeater", shortName: "SR03", hwModel: "RAK4631", role: "ROUTER" },
    position: { latitude: 39.7622, longitude: -105.0203, altitude: 2100, time: now - 500 },
    snr: 3.0, lastHeard: now - 300, hopsAway: 2, batteryLevel: 45, voltage: 3.65, viaMqtt: false, isFavorite: false,
  },
};

const homeBaseMessages: MeshMessage[] = [
  { id: "msg-001", from: 0xaabbcc02, to: 0xffffffff, channel: 0, text: "Good morning mesh! Hilltop relay is up and running.", timestamp: now - 3600, rxSnr: 8.0, rxRssi: -85, hopStart: 3, hopLimit: 2, ackStatus: "none" },
  { id: "msg-002", from: 0xaabbcc01, to: 0xffffffff, channel: 0, text: "Morning! Seeing great signal from home base today.", timestamp: now - 3500, ackStatus: "acked" },
  { id: "msg-003", from: 0xaabbcc03, to: 0xffffffff, channel: 0, text: "Park node checking in. Battery at 54%.", timestamp: now - 2400, rxSnr: 4.5, rxRssi: -92, hopStart: 3, hopLimit: 1, ackStatus: "none" },
  { id: "msg-004", from: 0xaabbcc04, to: 0xffffffff, channel: 0, text: "Anyone else seeing increased traffic on channel 2?", timestamp: now - 1800, rxSnr: 2.0, rxRssi: -98, hopStart: 3, hopLimit: 1, ackStatus: "none" },
  { id: "msg-005", from: 0xaabbcc01, to: 0xffffffff, channel: 0, text: "Yes, I see it too. Might be a new node coming online.", timestamp: now - 1700, ackStatus: "acked" },
  { id: "msg-006", from: 0xaabbcc02, to: 0xaabbcc01, channel: 0, text: "DM: Can you check the relay config when you get a chance?", timestamp: now - 900, rxSnr: 8.0, rxRssi: -84, ackStatus: "none" },
  { id: "msg-007", from: 0xaabbcc01, to: 0xaabbcc02, channel: 0, text: "Sure, I'll take a look tonight.", timestamp: now - 800, ackStatus: "acked" },
  { id: "msg-008", from: 0xaabbcc05, to: 0xffffffff, channel: 0, text: "MQTT bridge: 12 nodes seen in the last hour", timestamp: now - 300, ackStatus: "none" },
  { id: "msg-009", from: 0xaabbcc03, to: 0xffffffff, channel: 0, text: "Heading home, park node going to low power mode.", timestamp: now - 120, rxSnr: 4.5, rxRssi: -93, ackStatus: "none" },
  { id: "msg-010", from: 0xaabbcc01, to: 0xffffffff, channel: 0, text: "Copy that. Stay safe!", timestamp: now - 60, ackStatus: "pending" },
];

const mobileMessages: MeshMessage[] = [
  { id: "msg-101", from: 0xddee0001, to: 0xffffffff, channel: 0, text: "Mobile node online, heading up the trail!", timestamp: now - 5400, ackStatus: "acked" },
  { id: "msg-102", from: 0xddee0002, to: 0xffffffff, channel: 0, text: "Trail marker A: path is clear today.", timestamp: now - 4200, rxSnr: 6.5, rxRssi: -88, ackStatus: "none" },
  { id: "msg-103", from: 0xddee0001, to: 0xffffffff, channel: 0, text: "Great reception at the trailhead. SNR looking solid.", timestamp: now - 3600, ackStatus: "acked" },
  { id: "msg-104", from: 0xddee0003, to: 0xffffffff, channel: 0, text: "Summit repeater status: all good, 45% battery.", timestamp: now - 2700, rxSnr: 3.0, rxRssi: -95, ackStatus: "none" },
  { id: "msg-105", from: 0xddee0001, to: 0xddee0002, channel: 0, text: "DM: How's the solar charging up there?", timestamp: now - 1800, ackStatus: "acked" },
  { id: "msg-106", from: 0xddee0002, to: 0xddee0001, channel: 0, text: "Steady charge, should last through the night.", timestamp: now - 1600, rxSnr: 6.5, rxRssi: -87, ackStatus: "none" },
  { id: "msg-107", from: 0xddee0001, to: 0xffffffff, channel: 0, text: "Reached the summit! Amazing mesh coverage up here.", timestamp: now - 600, ackStatus: "acked" },
  { id: "msg-108", from: 0xddee0003, to: 0xffffffff, channel: 0, text: "Welcome to the top! You should see 5+ nodes from there.", timestamp: now - 500, rxSnr: 3.0, rxRssi: -94, ackStatus: "none" },
];

export const mockConnections: Record<string, NodeConnection> = {
  "conn-home-base": {
    id: "conn-home-base",
    label: "Home Base",
    transport: "serial",
    transportAddress: "COM3",
    status: "connected",
    myNodeNum: 0xaabbcc01,
    myUser: homeBaseNodes[0xaabbcc01].user,
    channels: [
      { index: 0, name: "LongFast", role: "primary", psk: [1], uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 32, isClientMuted: false },
      { index: 1, name: "Admin", role: "secondary", psk: [1], uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0, isClientMuted: false },
    ],
    meshNodes: homeBaseNodes,
    messages: homeBaseMessages,
    deviceConfigs: {},
    batteryLevel: 98,
    voltage: 4.15,
    lastActivity: now - 30,
  },
  "conn-mobile": {
    id: "conn-mobile",
    label: "Mobile Node",
    transport: "wifi",
    transportAddress: "192.168.1.100",
    status: "connected",
    myNodeNum: 0xddee0001,
    myUser: mobileNodes[0xddee0001].user,
    channels: [
      { index: 0, name: "LongFast", role: "primary", psk: [1], uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 32, isClientMuted: false },
      { index: 1, name: "Hiking", role: "secondary", psk: [1], uplinkEnabled: false, downlinkEnabled: false, positionPrecision: 0, isClientMuted: false },
    ],
    meshNodes: mobileNodes,
    messages: mobileMessages,
    deviceConfigs: {},
    batteryLevel: 72,
    voltage: 3.88,
    lastActivity: now - 10,
  },
};

export const mockConnectionOrder = ["conn-home-base", "conn-mobile"];
