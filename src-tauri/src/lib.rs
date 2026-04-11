mod commands;

use std::sync::Mutex;

use tauri::{
    image::Image as TauriImage,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Listener, Manager, RunEvent,
};

/// Shared state to track the tray icon ID so we can update its menu later.
struct TrayState {
    tray_id: String,
}

/// Rebuild the tray right-click menu with current instance actions.
fn rebuild_tray_menu(app: &tauri::AppHandle, instances: &[commands::ColimaInstance]) {
    let tray_state = app.state::<Mutex<TrayState>>();
    let tray_id = tray_state.lock().unwrap().tray_id.clone();

    let Some(tray) = app.tray_by_id(&tray_id) else { return };

    let mut builder = MenuBuilder::new(app);

    // Show / Hide
    if let Ok(item) = MenuItemBuilder::with_id("show-hide", "Show / Hide").build(app) {
        builder = builder.item(&item);
    }
    builder = builder.separator();

    // Instance actions
    for inst in instances {
        let is_running = inst.status.eq_ignore_ascii_case("running");
        let label = if is_running {
            format!("{} (Running)", inst.profile)
        } else {
            format!("{} (Stopped)", inst.profile)
        };

        // Section header (disabled item)
        if let Ok(item) = MenuItemBuilder::with_id(format!("header-{}", inst.profile), &label)
            .enabled(false)
            .build(app)
        {
            builder = builder.item(&item);
        }

        if is_running {
            if let Ok(item) = MenuItemBuilder::with_id(
                format!("stop-{}", inst.profile),
                format!("  Stop {}", inst.profile),
            )
            .build(app)
            {
                builder = builder.item(&item);
            }
            if let Ok(item) = MenuItemBuilder::with_id(
                format!("restart-{}", inst.profile),
                format!("  Restart {}", inst.profile),
            )
            .build(app)
            {
                builder = builder.item(&item);
            }
        } else {
            if let Ok(item) = MenuItemBuilder::with_id(
                format!("start-{}", inst.profile),
                format!("  Start {}", inst.profile),
            )
            .build(app)
            {
                builder = builder.item(&item);
            }
        }
        builder = builder.separator();
    }

    // Quit
    if let Ok(item) = MenuItemBuilder::with_id("quit", "Quit Colima Manager").build(app) {
        builder = builder.item(&item);
    }

    if let Ok(menu) = builder.build() {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Helper: show the main window
fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Helper: hide the main window (keeps Dock icon & Cmd+Tab entry)
fn hide_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

/// Helper: toggle the main window visibility
fn toggle_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if win.is_visible().unwrap_or(false) {
            hide_window(app);
        } else {
            show_window(app);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::WatcherState::default())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_instances,
            commands::start_instance,
            commands::stop_instance,
            commands::restart_instance,
            commands::delete_instance,
            commands::prune_instance,
            commands::force_stop_instance,
            commands::kill_stale_processes,
            commands::get_version,
            commands::get_docker_contexts,
            commands::read_config,
            commands::get_containers,
            commands::get_containers_by_context,
            commands::container_action,
            commands::get_container_logs,
            commands::colima_model_setup,
            commands::colima_model_run,
            commands::get_vm_type,
            commands::get_images,
            commands::remove_image,
            commands::prune_images,
            commands::get_volumes,
            commands::remove_volume,
            commands::prune_volumes,
            commands::start_docker_watcher,
            commands::stop_docker_watcher,
            commands::stream_container_logs,
            commands::stop_container_log_stream,
            commands::start_colima_poller,
            commands::load_settings,
            commands::save_settings,
            commands::get_vm_stats,
            commands::get_container_stats,
            commands::container_exec,
            commands::pull_image,
            commands::inspect_container,
            commands::colima_model_serve,
            commands::colima_model_stop_serve,
            commands::colima_model_pull,
            commands::colima_model_list,
        ])
        .setup(|app| {
            // Apply frosted glass vibrancy to the main window
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Popover, None, Some(16.0));

                // Intercept the native close button (X) to hide instead of quit
                let app_handle = app.app_handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        hide_window(&app_handle);
                    }
                });
            }

            // Initial tray menu (before we know about instances)
            let show_hide = MenuItemBuilder::with_id("show-hide", "Show / Hide").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit Colima Manager").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_hide)
                .separator()
                .item(&quit)
                .build()?;

            // Tray icon — left click toggles window, right click shows menu
            let tray_png = image::load_from_memory(include_bytes!("../icons/tray-icon.png"))
                .expect("failed to decode tray icon")
                .into_rgba8();
            let (w, h) = tray_png.dimensions();
            let tray_icon = TauriImage::new_owned(tray_png.into_raw(), w, h);

            let tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Colima Manager")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    match id {
                        "quit" => app.exit(0),
                        "show-hide" => toggle_window(app),
                        _ if id.starts_with("start-") => {
                            let profile = id.strip_prefix("start-").unwrap().to_string();
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = commands::start_instance_simple(app, profile).await;
                            });
                        }
                        _ if id.starts_with("stop-") => {
                            let profile = id.strip_prefix("stop-").unwrap().to_string();
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = commands::stop_instance_simple(app, profile).await;
                            });
                        }
                        _ if id.starts_with("restart-") => {
                            let profile = id.strip_prefix("restart-").unwrap().to_string();
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let _ = commands::restart_instance_simple(app, profile).await;
                            });
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Store tray ID for dynamic menu updates
            let tray_id = tray.id().0.clone();
            app.manage(Mutex::new(TrayState { tray_id }));

            // Listen for instance status changes to rebuild tray menu
            let app_handle = app.app_handle().clone();
            app.listen("colima-status-changed", move |event: tauri::Event| {
                if let Ok(instances) =
                    serde_json::from_str::<Vec<commands::ColimaInstance>>(event.payload())
                {
                    rebuild_tray_menu(&app_handle, &instances);
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Handle dock icon click on macOS (reopen event)
            if let RunEvent::Reopen { .. } = event {
                show_window(app);
            }
        });
}
