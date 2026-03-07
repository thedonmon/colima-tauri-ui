mod commands;

use tauri::{
    image::Image as TauriImage,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};

/// Helper: show the main window and switch to Regular activation policy
fn show_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            use tauri::ActivationPolicy;
            let _ = app.set_activation_policy(ActivationPolicy::Regular);
        }
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Helper: hide the main window and switch to Accessory activation policy
fn hide_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
        #[cfg(target_os = "macos")]
        {
            use tauri::ActivationPolicy;
            let _ = app.set_activation_policy(ActivationPolicy::Accessory);
        }
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
        .invoke_handler(tauri::generate_handler![
            commands::list_instances,
            commands::start_instance,
            commands::stop_instance,
            commands::restart_instance,
            commands::delete_instance,
            commands::prune_instance,
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
        ])
        .setup(|app| {
            // Start as Accessory (no Dock icon, no Cmd+Tab)
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                app.set_activation_policy(ActivationPolicy::Accessory);
            }

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

            // Right-click tray menu
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

            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("Colima Manager")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show-hide" => toggle_window(app),
                    _ => {}
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
