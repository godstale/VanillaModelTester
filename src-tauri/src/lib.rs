pub mod commands;

use commands::fs_commands::*;
use commands::laya_service::*;
use commands::search_commands::*;
use commands::shell_commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::laya_service::LayaServiceState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("app".into()),
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(10_000_000) // 10 MB limit per log file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5)) // Keep at most 5 rotated log files
                .build(),
        )
        .setup(|app| {
            use tauri::Manager;
            for window in app.webview_windows().values() {
                let _ = window.set_theme(Some(tauri::Theme::Light));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            set_active_workspace,
            ensure_app_dir,
            get_app_paths,
            read_project_folder_tree,
            read_text_file,
            write_text_file,
            save_binary_file,
            create_file,
            create_folder,
            rename_path,
            delete_path,
            list_dir,
            copy_path,
            reveal_in_explorer,
            grep_files,
            find_files,
            run_shell,
            laya_start,
            laya_stop,
            laya_status,
            laya_logs,
            laya_http_get,
            laya_http_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
