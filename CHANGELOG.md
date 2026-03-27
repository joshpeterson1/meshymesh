# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- BLE transport backend: btleplug-based Bluetooth Low Energy support for connecting to Meshtastic nodes
- BLE device scanning command with Meshtastic service UUID filtering
- BLE connect command with auto-reconnect (3 retries, exponential backoff 3s-15s)
- BLE connection UI: new Bluetooth tab in Add Connection dialog with device scanning, signal strength indicators, and connection history

## [0.3.1] - 2026-03-26

### Added
- Emoji reaction send UI: right-click context menu on received messages shows a quick-pick row of common emoji reactions (thumbs up, heart, laugh, wow, sad, party)
- Config import/restore: "Import Config" button reads exported JSON backups, validates structure, shows confirmation with section list, then sequentially applies each config with ACK tracking
- README updated: added 8 new features, removed 3 resolved limitations

### Fixed
- Sent reactions now show as badges on the target message instead of appearing as standalone text messages
- lastHeard now updated from telemetry and text message packets, not just NodeInfo/Position
- Stale handshake data no longer overwrites live signal/telemetry values (freshness-based merge)
- Telemetry freshness indicator in node detail panel shows when metrics were last received

## [0.3.0] - 2026-03-26

### Added
- Emoji reaction (tapback) receive support: reactions display as grouped emoji badges on target messages with sender tooltips
- Emoji reaction TX backend: send_text_message command accepts optional replyId and emoji params for future send UI
- Expandable node detail panel: click any node row to see Node #, User ID, Public Key, Uptime, First Heard, and telemetry
- Device metrics time-series log: telemetry entries stored per-node (up to 100), displayed as scrollable table
- Telemetry freshness indicator: shows "updated Xm ago" or "from handshake (may be stale)" in node detail panel
- First Heard tracking: records when each node was first discovered in the current session
- Public key forwarded from device as hex string (previously only stored as boolean)
- Per-node storage of uptime, channel utilization, and air util TX from DeviceMetricsUpdate events
- Unknown node filter in Nodes view: cycle through off / hide / only (matches nodes with no name data)
- Incomplete node filter in Nodes view: cycle through off / hide / only (matches nodes missing name or hardware model)
- Admin command response tracking: config save commands return packet IDs, frontend correlates with device ACKs, 10s timeout fallback
- Connection auto-recovery: automatic reconnect on unexpected disconnect with transport-aware exponential backoff (serial: 5 retries/2s, WiFi: 10 retries/1s)
- "reconnecting" connection status with orange pulsing indicator in NodeRail and StatusBar
- Message search in ConversationsView: filter by text content, sender short name, or sender long name with result count
- Config save toasts now show "confirmed by device" / "device did not confirm" / "device rejected" based on actual ACK response
- Device config editor: role, rebroadcast mode, NodeInfo broadcast interval, GPIO, triple-click, LED heartbeat
- Display config editor: screen timeout, carousel, GPS format, units, OLED type, display mode, flip, compass
- Power config editor: power saving mode, shutdown timer, sleep durations, BT wait, ADC override
- Position config editor: GPS enable, fixed position, smart broadcast, intervals, distances, GPIO
- Bluetooth config editor: enable, pairing mode, fixed PIN
- RadioConfigEditor split into subcomponents: FormFields, LoraConfigSection, ChannelsSection, SecurityConfigSection
- Test infrastructure: vitest (29 frontend tests) and cargo test (9 Rust tests)
- React error boundaries around all view components with recovery UI
- IndexedDB schema versioning with incremental migration support
- Message deduplication by ID in nodeStore

### Fixed
- Nodes showing user ID instead of name: NodeDiscovered with null user now preserves existing node data
- "20538d ago" last heard: lastHeard=0 now displays "N/A" instead of days since Unix epoch
- Stale handshake data no longer overwrites live telemetry/signal values (lastHeard freshness-based merge)
- lastHeard now updated from all packet types (telemetry, messages), not just NodeInfo/Position
- Disconnect lifecycle race: disconnect_node now removes handle immediately and awaits task completion with 5s timeout
- Serial channels bounded (256 FromRadio, 32 ToRadio) to prevent unbounded memory growth
- TCP echo channel bounded (32)
- Replaced ~10 silent `.catch(() => {})` with console.warn logging or user-facing toast errors
- uiStore: default selectedConnectionId changed from mock ID to null
- uiStore: removed no-op ternary in selectConnection

### Removed
- Dead mock data file (src/lib/mockData.ts) and loadMockData method from nodeStore

## [0.2.0] - 2026-03-25

### Added
- Favorite nodes shown with yellow star indicator on avatar in nodes table
- Nodes view sort button cycles through: Last Heard, Name, Hops, SNR, Battery
- Role badges color-coded: Router (blue), Repeater (purple), Tracker (orange), Muted/Hidden (grey)
- CLIENT_BASE role (value 12) added to role display map
- LoRa config extracted from device Config packets during handshake
- Settings view shows LoRa Configuration section with Frequency Slot, Modem Preset, and Region
- Node rail groups connections by frequency slot with collapsible Discord-style folders
- All device Config variants captured during handshake and stored in frontend
- AdminMessage command infrastructure: BeginEditSettings, SetConfig, CommitEditSettings transaction pattern
- Tauri commands for setting all config sections with backend validation
- Radio Config editor in Settings: editable LoRa, Channels, and Security sections with Save buttons
- Confirmation dialog for dangerous changes (region, frequency slot, TX disable, serial disable)
- Changes diff view before commit: shows old to new values for each modified field
- Config backup/export: saves all device config and channels to JSON
- Full channel editor: name, encryption key, role, MQTT uplink/downlink, position precision, mute
- Connection history persisted to app data dir (up to 20 entries)
- Quick reconnect ghost icons in node rail for recently used connections
- Right-click context menu on node rail connections
- Local node designated with green avatar ring, "You" badge, and green row tint
- Search bar in nodes tab
- Toast notification system (sonner)
- App settings persistence with stale node cleanup days
- IndexedDB cache layer for messages and nodes, keyed by transport:address

### Fixed
- Serial connection no longer sets DTR high, preventing ESP32 resets on connect
- Device unplug now emits "error" status instead of "disconnected"
- Fixed double-emit on serial disconnect
- ACK system rewritten with proper direct/implicit/max_retransmit distinction
- Fixed want_response vs want_ack confusion on sent packets
- TCP connections now emit MessageSent events, fixing ACKs on WiFi
- Serial reader checks for channel closure each iteration, releasing COM port on disconnect
- Role mapping uses as_str_name() with friendly display names
- is_favorite field extracted from NodeInfo protobuf

## [0.1.0] - 2026-03-24

### Added
- Full UI shell with Discord-style layout (node rail, sidebar, content area, status bar)
- Rust transport layer with meshtastic crate integration
- ConnectionManager for multi-node async task management
- Serial and TCP/WiFi connection support
- Tauri commands: list_serial_ports, connect_serial, connect_tcp, disconnect_node, send_text_message
- Real-time event emission for messages, node discovery, telemetry, channels
- FromRadio packet processing for TextMessage, Position, NodeInfo, Telemetry, Routing ports
- Typed Tauri IPC wrappers
- Event bridge hook mapping Rust events to Zustand store
- AddConnectionDialog with Serial port dropdown and WiFi IP input
- Conversations, Nodes, Map (placeholder), and Settings views
- Zustand stores for node and UI state management
- Dark theme with Meshtastic-inspired green accent
- README with project overview, setup instructions, and architecture docs
- GPL-3.0 license
