mod commands;
mod error;
mod events;
mod state;
mod transport;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::discovery::list_serial_ports,
            commands::discovery::scan_ble_devices,
            commands::lifecycle::connect_serial,
            commands::lifecycle::connect_tcp,
            commands::lifecycle::connect_ble,
            commands::lifecycle::disconnect_node,
            commands::messaging::send_text_message,
            commands::config::set_lora_config,
            commands::config::set_device_config,
            commands::config::set_display_config,
            commands::config::set_power_config,
            commands::config::set_position_config,
            commands::config::set_bluetooth_config,
            commands::config::set_security_config,
            commands::config::set_channel,
            commands::history::get_connection_history,
            commands::history::save_connection_history_entry,
            commands::history::forget_connection_history_entry,
            commands::settings::get_app_settings,
            commands::settings::set_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
