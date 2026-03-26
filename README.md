# MeshyMesh

A multi-node Meshtastic desktop client for Windows, built with [Tauri](https://tauri.app/), React, and Rust.

Connect to multiple Meshtastic radios simultaneously via Serial or WiFi and manage them from a single interface.

![License](https://img.shields.io/badge/license-GPL--3.0-blue)

## Features

- **Multi-connection management** -- connect to several nodes at once via serial (COM) or WiFi (TCP)
- **Discord-style UI** -- node rail, sidebar navigation, and content area
- **Real-time messaging** -- send and receive text messages with ACK tracking (direct, implicit, max retransmit)
- **Node discovery** -- live table of all discovered mesh nodes with sort/filter (last heard, name, hops, SNR, battery)
- **Full device configuration** -- LoRa, channels, security, power, display, Bluetooth, and position settings with diff preview before commit
- **Channel editor** -- encryption key management (none, default, AES128, AES256), MQTT uplink/downlink, position precision
- **Config backup/export** -- save device config and channels to JSON
- **Connection history** -- quick reconnect to previously used serial ports and WiFi addresses
- **Frequency slot grouping** -- node rail groups connections by channel number with collapsible folders
- **Device metrics** -- battery level, voltage, channel utilization, air utilization
- **Role badges** -- color-coded role indicators (Router, Repeater, Tracker, etc.)

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
