# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Admin command response tracking: config save commands now return packet IDs, frontend correlates with device ACKs via MessageAck events, 10s timeout fallback for firmware that doesn't respond
- Admin tracker module (src/lib/adminTracker.ts) with Promise-based tracking, auto-timeout, and 5 tests
- Connection auto-recovery: automatic reconnect on unexpected disconnect with transport-aware exponential backoff (serial: 5 retries starting 2s, WiFi: 10 retries starting 1s)
- "reconnecting" connection status with orange pulsing indicator in NodeRail and StatusBar
- Disconnect command cancels reconnection during backoff period
- Message search in ConversationsView: filter by text content, sender short name, or sender long name with result count
- Config save toasts now show "confirmed by device" / "device did not confirm" / "device rejected" based on actual ACK response
- RadioConfigEditor split into subcomponents: FormFields, LoraConfigSection, ChannelsSection, SecurityConfigSection (from 1,100-line monolith)
- Device config editor: role, rebroadcast mode, NodeInfo broadcast interval, GPIO, triple-click, LED heartbeat
- Display config editor: screen timeout, carousel, GPS format, units, OLED type, display mode, flip, compass
- Power config editor: power saving mode, shutdown timer, sleep durations, BT wait, ADC override
- Position config editor: GPS enable, fixed position, smart broadcast, intervals, distances, GPIO
- Bluetooth config editor: enable, pairing mode, fixed PIN
- Test infrastructure: vitest (frontend) and cargo test (Rust backend) with critical path tests
- 24 frontend tests covering nodeStore operations (connections, messages, nodes, channels, dedup)
- 9 Rust tests covering config transaction building and serial frame extraction
- React error boundaries around all view components in ContentArea (crash isolation with recovery UI)
- IndexedDB schema versioning with incremental migration support in cache.ts
- Message deduplication by ID in nodeStore.addMessage

### Fixed
- uiStore: default selectedConnectionId changed from mock "conn-home-base" to null
- uiStore: removed no-op ternary in selectConnection that always returned "conversations"
- Disconnect lifecycle race: disconnect_node now removes handle from manager immediately and awaits task completion with 5s timeout
- Serial channels bounded (256 FromRadio, 32 ToRadio) to prevent unbounded memory growth on busy meshes
- TCP echo channel bounded (32) to prevent unbounded growth
- Replaced ~10 silent `.catch(() => {})` with console.warn logging or user-facing toast errors across event hook, NodeRail, SettingsView, and AddConnectionDialog

### Removed
- Dead mock data file (src/lib/mockData.ts) and loadMockData method from nodeStore

### Added
- README.md with project overview, setup instructions, and architecture docs
- .gitignore for Node, Rust, Tauri, IDE, and OS artifacts
- GPL-3.0 LICENSE file
- Git repository initialized
- Early development notice and current limitations section in README

### Added
- Favorite nodes shown with yellow star indicator on avatar in nodes table
- Nodes view sort button cycles through: Last Heard, Name, Hops, SNR, Battery
- Role badges now color-coded: Router (blue), Repeater (purple), Tracker (orange), Muted/Hidden (grey)
- CLIENT_BASE role (value 12) added to role display map
- LoRa config extracted from device Config packets during handshake (channel_num, modem_preset, region)
- Settings view shows LoRa Configuration section with Frequency Slot, Modem Preset, and Region
- Node rail groups connections by frequency slot (channel_num) with collapsible Discord-style folders
- All device Config variants (Device, Position, Power, Display, LoRa, Bluetooth, Security) captured during handshake and stored in frontend
- AdminMessage command infrastructure: BeginEditSettings → SetConfig → CommitEditSettings transaction pattern
- Tauri commands for setting all config sections: set_lora_config, set_device_config, set_display_config, set_power_config, set_position_config, set_bluetooth_config, set_security_config, set_channel
- Backend validation: hop limit 1-7, channel name < 12 bytes, PSK 0/1/16/32 bytes
- Frontend IPC wrappers for all config commands
- Radio Config editor in Settings: editable LoRa, Channels, and Security sections with Save buttons
- Forms disabled when not connected, with warning banner
- Confirmation dialog for dangerous changes (region, frequency slot, TX disable, serial disable)
- Changes diff view before commit: shows old → new values for each modified field
- Config backup/export: "Export Backup" button saves all device config + channels to a JSON file
- Full channel editor: name, encryption key (none/default/simple/random AES128/AES256), role (secondary/disabled), MQTT uplink/downlink, position precision (0-32 bits), mute notifications
- Channel PSK change triggers danger confirmation dialog
- Discard button to revert unsaved channel edits
- Channel summary row shows key type, uplink/downlink status, position precision, and mute state
- Backend now sends full channel data (PSK, uplink, downlink, module_settings) during handshake
- Advanced LoRa fields (bandwidth, spread factor, coding rate, frequency offset, override frequency, RX boosted gain, PA fan) shown behind collapsible toggle, read-only
- Security: added Managed Mode toggle with danger warning about remote admin requirement
- Security: public key displayed as hex (read-only), private key obscured with reveal toggle (read-only)
- Security: admin keys list displayed (read-only)
- "Backup Keys" button exports public + private keys as {shortName}_keys.txt
- Connection history persisted to app data dir (up to 20 entries, most recent first)
- Add Connection dialog: serial ports annotated with last-used device name and time, recent ports sorted first
- Add Connection dialog: WiFi tab shows clickable recent connections with device name and time
- Quick reconnect ghost icons in node rail for recently used connections (dashed border, dimmed, one-click reconnect)
- Right-click ghost icon to forget a history entry
- Right-click context menu on node rail connections: "Disconnect" for active connections, "Remove" for dead/errored ones
- Local node designated in nodes list with green avatar ring, "You" badge, and green row tint
- Local nodes and favorites pinned to top of nodes list regardless of sort
- Search bar in nodes tab — filters by long name, short name, node ID, hardware model, or hex node number
- Toast notification system (sonner): incoming messages, connection errors, config save success/failure, reconnect failures
- App settings persistence (Tauri app data dir): stale node cleanup days (1-30, default 7)
- App Settings UI in unified settings view with slider for stale node days and cache clear button
- IndexedDB cache layer for messages (no cap) and nodes, keyed by transport:address
- Messages cached on receive and send, restored on reconnect (DM history preserved)
- Nodes cached on discovery, cleaned of stale entries on reconnect based on app setting
- Clear Cache button removes all saved messages and node history

### Fixed
- Serial connection no longer sets DTR high, which was resetting ESP32 devices on connect (caused "Home Action" screen)
- Device unplug now emits "error" status (not "disconnected") so the UI shows something went wrong
- Fixed double-emit on serial disconnect that overwrote the error message with a blank "disconnected" status
- ACK system rewritten: MessageAck event now carries `from` node and raw `error_reason` instead of just a boolean
- Fixed `want_response: true` on sent Data payloads — this requests a reply message, not an ACK (ACK is MeshPacket.want_ack)
- ACKs now correctly distinguish: direct ACK (from destination), implicit ACK (from relay node), max retransmissions, and other failures
- Added "implicit" (blue check) and "max_retransmit" (yellow rotate) ack status icons with tooltips
- TCP connections now emit MessageSent events (extracts packet ID from echo router), fixing ACKs never matching on WiFi
- Serial reader now checks for channel closure on each loop iteration, ensuring COM port is fully released on disconnect (previously the reader could hold the port open indefinitely if the device was idle)
- Role mapping now uses `as_str_name()` (SCREAMING_SNAKE_CASE) instead of `{:?}` (PascalCase), fixing role badge colors that never matched
- Roles display with friendly names (e.g., "Router" instead of "ROUTER") and handle unknown firmware roles gracefully
- `is_favorite` field now extracted from NodeInfo protobuf and forwarded to frontend

### Added
- Phase 1: Full UI shell with Discord-style layout (node rail, sidebar, content area, status bar)
- Phase 1: Mock data with two sample nodes (Home Base via Serial, Mobile Node via WiFi)
- Phase 1: Conversations, Nodes, Map (placeholder), and Settings views
- Phase 1: Zustand stores for node and UI state management
- Phase 1: Dark theme with Meshtastic-inspired green accent
- Phase 2: Rust transport layer with `meshtastic` crate integration
- Phase 2: ConnectionManager for multi-node async task management
- Phase 2: Serial and TCP/WiFi connection support
- Phase 2: Tauri commands: list_serial_ports, connect_serial, connect_tcp, disconnect_node, send_text_message
- Phase 2: Real-time event emission (node-event) for messages, node discovery, telemetry, channels
- Phase 2: FromRadio packet processing for TextMessage, Position, NodeInfo, Telemetry, Routing ports
- Phase 3: Typed Tauri IPC wrappers (`src/lib/tauri.ts`)
- Phase 3: Event bridge hook mapping Rust snake_case events to Zustand camelCase actions
- Phase 3: AddConnectionDialog with Serial port dropdown and WiFi IP input
- Phase 3: Wired + button in NodeRail to open connection dialog
- Phase 3: Wired send button in ConversationsView with optimistic message display
- Phase 3: App starts with empty state (no mock data by default)
- Phase 3: Skeleton connection support (node appears in rail immediately on connect)
