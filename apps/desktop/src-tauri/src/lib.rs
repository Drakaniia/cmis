use tauri::Emitter;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Connection string shared by the frontend (`src/lib/db.ts`) and the preload
/// list in `tauri.conf.json`. The plugin only runs migrations registered under
/// this exact key.
const DB_URL: &str = "sqlite:cmis.db";

/// The device-local schema.
///
/// The `.sql` files in `src-tauri/migrations` are inert on their own — the SQL
/// plugin has to be handed a migration list at build time. Registering them
/// here is what creates `inventory_items` and friends on first launch; without
/// it every query fails with `no such table: inventory_items`.
///
/// Migrations are append-only: never edit or renumber one that has shipped, or
/// sqlx will refuse to start with a version mismatch. Add a new file instead.
fn db_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "request_queue",
            sql: include_str!("../migrations/0001_request_queue.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "inventory",
            sql: include_str!("../migrations/0002_inventory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "dispensing_events",
            sql: include_str!("../migrations/0003_dispensing_events.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "inventory_creation",
            sql: include_str!("../migrations/0004_inventory_creation.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "strength_fields",
            sql: include_str!("../migrations/0005_strength_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "categories",
            sql: include_str!("../migrations/0006_categories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "request_queue_dispensing",
            sql: include_str!("../migrations/0007_request_queue_dispensing.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "request_source",
            sql: include_str!("../migrations/0008_request_source.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, db_migrations())
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            #[cfg(target_os = "macos")]
            {
                if let Err(e) = setup_native_menu(app.handle()) {
                    log::warn!("Failed to setup native menu: {}", e);
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            handle_menu_event(app, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "macos")]
fn setup_native_menu(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    // File menu — minimal per spec: New Request, Import/Export, Settings, Exit (Quit)
    let new_request = MenuItem::with_id(app, "file.new-request", "New Request…", true, Some("CmdOrCtrl+N"))?;
    // Ctrl+D / ⌘D — the one-action counter hand-over (quick deduct spec D5).
    let quick_deduct = MenuItem::with_id(app, "file.quick-deduct", "Deduct Stock…", true, Some("CmdOrCtrl+D"))?;
    let import_item = MenuItem::with_id(app, "file.import", "Import…", true, None::<&str>)?;
    let export_item = MenuItem::with_id(app, "file.export", "Export…", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "file.settings", "Settings…", true, Some("CmdOrCtrl+,"))?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &new_request,
            &quick_deduct,
            &PredefinedMenuItem::separator(app)?,
            &import_item,
            &export_item,
            &PredefinedMenuItem::separator(app)?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("Quit CMIS"))?,
        ],
    )?;

    // Edit menu — standard clipboard (native roles carry correct accelerators + undo stack)
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("Undo"))?,
            &PredefinedMenuItem::redo(app, Some("Redo"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("Cut"))?,
            &PredefinedMenuItem::copy(app, Some("Copy"))?,
            &PredefinedMenuItem::paste(app, Some("Paste"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::select_all(app, Some("Select All"))?,
        ],
    )?;

    // View menu — chrome + navigation
    let toggle_sidebar = MenuItem::with_id(app, "view.toggle-sidebar", "Toggle Sidebar", true, Some("CmdOrCtrl+B"))?;
    let zoom_in = MenuItem::with_id(app, "view.zoom-in", "Zoom In", true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out = MenuItem::with_id(app, "view.zoom-out", "Zoom Out", true, Some("CmdOrCtrl+-"))?;
    let zoom_reset = MenuItem::with_id(app, "view.zoom-reset", "Actual Size", true, Some("CmdOrCtrl+0"))?;
    let fullscreen = MenuItem::with_id(app, "view.fullscreen", "Toggle Full Screen", true, Some("F11"))?;
    let theme_light = MenuItem::with_id(app, "view.appearance.light", "Light", true, None::<&str>)?;
    let theme_dark = MenuItem::with_id(app, "view.appearance.dark", "Dark", true, None::<&str>)?;
    let theme_system = MenuItem::with_id(app, "view.appearance.system", "System", true, None::<&str>)?;
    let appearance = Submenu::with_items(app, "Appearance", true, &[&theme_light, &theme_dark, &theme_system])?;
    let go_overview = MenuItem::with_id(app, "view.go-overview", "Go to Overview", true, None::<&str>)?;
    let go_inventory = MenuItem::with_id(app, "view.go-inventory", "Go to Stock Management", true, None::<&str>)?;
    let go_expiry = MenuItem::with_id(app, "view.go-expiry", "Go to Expiry Alerts", true, None::<&str>)?;
    let go_lowstock = MenuItem::with_id(app, "view.go-lowstock", "Go to Low-Stock Alerts", true, None::<&str>)?;
    let go_requests = MenuItem::with_id(app, "view.go-requests", "Go to Request Queue", true, None::<&str>)?;
    let go_dispensing = MenuItem::with_id(app, "view.go-dispensing", "Go to Dispensing Log", true, None::<&str>)?;
    let go_reports = MenuItem::with_id(app, "view.go-reports", "Go to Reports", true, None::<&str>)?;
    let go_audit = MenuItem::with_id(app, "view.go-audit", "Go to Audit Logs", true, None::<&str>)?;
    let go_health = MenuItem::with_id(app, "view.go-health", "Go to System Health", true, None::<&str>)?;
    let go_data = MenuItem::with_id(app, "view.go-data", "Go to Data", true, None::<&str>)?;
    let go_users = MenuItem::with_id(app, "view.go-users", "Go to Users", true, None::<&str>)?;
    let go_settings = MenuItem::with_id(app, "view.go-settings", "Go to Settings", true, None::<&str>)?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &toggle_sidebar,
            &PredefinedMenuItem::separator(app)?,
            &zoom_in,
            &zoom_out,
            &zoom_reset,
            &fullscreen,
            &PredefinedMenuItem::separator(app)?,
            &appearance,
            &PredefinedMenuItem::separator(app)?,
            &go_overview,
            &go_inventory,
            &go_expiry,
            &go_lowstock,
            &go_requests,
            &go_dispensing,
            &go_reports,
            &go_audit,
            &go_health,
            &go_data,
            &go_users,
            &go_settings,
        ],
    )?;

    // Window menu — standard
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("Minimize"))?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some("Close Window"))?,
        ],
    )?;

    // Help menu — standard set, native About is handled separately; we add custom items
    let about = MenuItem::with_id(app, "help.about", "About CMIS", true, None::<&str>)?;
    let check_updates = MenuItem::with_id(app, "help.check-updates", "Check for Updates…", true, None::<&str>)?;
    let shortcuts = MenuItem::with_id(app, "help.shortcuts", "Keyboard Shortcuts", true, Some("CmdOrCtrl+/"))?;
    let report_issue = MenuItem::with_id(app, "help.report-issue", "Report Issue…", true, None::<&str>)?;
    let docs = MenuItem::with_id(app, "help.docs", "View Documentation", true, None::<&str>)?;
    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[
            &about,
            &check_updates,
            &shortcuts,
            &PredefinedMenuItem::separator(app)?,
            &report_issue,
            &docs,
        ],
    )?;

    let menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &window_menu, &help_menu])?;
    app.set_menu(menu)?;
    Ok(())
}

fn handle_menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id.0.as_str();
    // Native window actions already handled by PredefinedMenuItem; custom ids emit to frontend
    const CUSTOM_IDS: &[&str] = &[
        "file.new-request",
        "file.quick-deduct",
        "file.import",
        "file.export",
        "file.settings",
        "view.toggle-sidebar",
        "view.zoom-in",
        "view.zoom-out",
        "view.zoom-reset",
        "view.fullscreen",
        "view.appearance.light",
        "view.appearance.dark",
        "view.appearance.system",
        "view.go-overview",
        "view.go-inventory",
        "view.go-expiry",
        "view.go-lowstock",
        "view.go-requests",
        "view.go-dispensing",
        "view.go-reports",
        "view.go-audit",
        "view.go-health",
        "view.go-data",
        "view.go-users",
        "view.go-settings",
        "help.about",
        "help.check-updates",
        "help.shortcuts",
        "help.report-issue",
        "help.docs",
    ];
    if CUSTOM_IDS.contains(&id) {
        let _ = app.emit("menu:action", id);
    }
}
