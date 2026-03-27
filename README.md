# MeshyMesh

A multi-node Meshtastic desktop client for Windows, built with [Tauri](https://tauri.app/), React, and Rust.

Connect to multiple Meshtastic radios simultaneously via Serial or WiFi and manage them from a single interface.

![License](https://img.shields.io/badge/license-GPL--3.0-blue)

> **Early Development** -- MeshyMesh is under active development and not yet feature-complete. Core messaging, node discovery, and device configuration work, but several areas are still in progress. See [Current Limitations](#current-limitations) below.

## Features

- **Multi-connection management** -- connect to several nodes at once via serial (COM) or WiFi (TCP)
- **Discord-style UI** -- node rail, sidebar navigation, and content area
- **Real-time messaging** -- send and receive text messages with ACK tracking (direct, implicit, max retransmit)
- **Emoji reactions** -- receive and display tapback reactions on messages; send reactions via right-click menu
- **Message search** -- filter conversations by text content or sender name
- **Node discovery** -- live table of all discovered mesh nodes with sort/filter (last heard, name, hops, SNR, battery)
- **Node detail panel** -- click any node row to see full device info, public key, uptime, first heard, and telemetry log
- **Unknown/incomplete node filters** -- hide or isolate nodes missing name or hardware info
- **Full device configuration** -- LoRa, device, display, power, position, Bluetooth, channels, and security settings with diff preview before commit
- **Channel editor** -- encryption key management (none, default, AES128, AES256), MQTT uplink/downlink, position precision
- **Config backup/restore** -- export device config and channels to JSON, import from backup
- **Admin command tracking** -- config saves confirm device acknowledgment with timeout fallback
- **Connection history** -- quick reconnect to previously used serial ports and WiFi addresses
- **Auto-reconnect** -- automatic recovery on unexpected disconnect with transport-aware exponential backoff
- **Frequency slot grouping** -- node rail groups connections by channel number with collapsible folders
- **Device metrics** -- battery level, voltage, channel utilization, air utilization with per-node telemetry history
- **Role badges** -- color-coded role indicators (Router, Repeater, Tracker, etc.)

## Current Limitations

- **No map view yet** -- the mesh map is a placeholder; interactive mapping with Leaflet is planned
- **BLE not available** -- Bluetooth is defined in the type system but has no connection UI; only Serial and WiFi work today
- **Read-only security keys** -- public key, private key, and admin key lists are display-only (backup export is supported)
- **Read-only advanced LoRa fields** -- bandwidth, spread factor, coding rate, frequency offset, and PA fan settings are view-only
- **Text messages only** -- no file transfer, waypoints, or structured telemetry payloads
- **Windows only** -- currently developed and tested on Windows; macOS/Linux builds are untested

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (WebView2 is included on Windows 11)

## Getting Started

```bash
# Install frontend dependencies
npm install

# Run in development mode (launches Tauri + Vite dev server)
npm run tauri dev

# Build for production
npm run tauri build
```

The dev server starts on `http://localhost:1420` and the Tauri window opens automatically.

## Project Structure

```
meshymesh/
├── src/                    # React frontend
│   ├── components/
│   │   ├── layout/         # AppLayout, NodeRail, Sidebar, ContentArea, StatusBar
│   │   ├── views/          # Conversations, Nodes, Map, Settings
│   │   ├── dialogs/        # AddConnection, Changes, Confirm
│   │   └── config/         # RadioConfigEditor
│   ├── hooks/              # useMeshtasticEvents (Rust event bridge)
│   ├── stores/             # Zustand stores (nodeStore, uiStore, types)
│   └── lib/                # Tauri IPC wrappers, utilities
├── src-tauri/              # Rust backend
│   └── src/
│       ├── commands/       # Tauri command handlers
│       ├── transport/      # Serial/TCP connection tasks, packet routing
│       ├── state.rs        # ConnectionManager
│       ├── events.rs       # Frontend event types
│       └── error.rs        # Error types
├── index.html
├── vite.config.ts
├── package.json
└── CHANGELOG.md
```

## Architecture

**Frontend**: React 18 + TypeScript + Tailwind CSS v4. State managed by Zustand. Communicates with the backend through typed Tauri IPC commands and listens for real-time events via the Tauri event emitter.

**Backend**: Rust with Tauri v2. Each connected device runs as an async Tokio task. The [`meshtastic`](https://crates.io/crates/meshtastic) crate handles protobuf encoding/decoding. Serial I/O via `tokio-serial`, TCP for WiFi connections.

**Data flow**: User action -> Tauri command -> Rust spawns/routes to connection task -> device responds with FromRadio packets -> Rust emits `node-event` -> frontend hook dispatches to Zustand store -> React re-renders.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
