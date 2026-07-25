use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;
use tauri::{Manager, WebviewWindow, AppHandle};
use tokio::sync::Mutex;

// State to track if backend is running
pub struct AppState {
    pub backend_process: Arc<Mutex<Option<std::process::Child>>>,
    pub auth_token: String,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        AppState {
            backend_process: Arc::clone(&self.backend_process),
            auth_token: self.auth_token.clone(),
        }
    }
}

fn generate_auth_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();
    let ptr = &nanos as *const _ as usize;
    format!(
        "{:016x}{:016x}{:016x}{:016x}",
        nanos,
        (nanos >> 64) ^ (pid as u128),
        ptr as u128,
        nanos ^ 0xDEADBEEFCAFEBABE
    )
}

// Window control commands
#[tauri::command]
async fn win_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
async fn win_maximize(window: WebviewWindow) -> Result<(), String> {
    window.maximize().map_err(|e| e.to_string())
}

#[tauri::command]
async fn win_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
async fn win_toggle_maximize(window: WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn show_window(window: WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_auth_token(state: tauri::State<'_, AppState>) -> String {
    state.auth_token.clone()
}

fn get_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    let sidecar_name = "nautilus-backend-x86_64-pc-windows-msvc.exe";

    #[cfg(target_os = "linux")]
    let sidecar_name = "nautilus-backend-x86_64-unknown-linux-gnu";

    #[cfg(target_os = "macos")]
    let sidecar_name = "nautilus-backend-x86_64-apple-darwin";

    let mut candidates = Vec::new();

    // 1. Resource dir (production build / installed app)
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("binaries").join(sidecar_name));
        candidates.push(resource_dir.join(sidecar_name));
    }

    // 2. Relative to current executable location (e.g. target/release/nautilus.exe)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("binaries").join(sidecar_name));
            candidates.push(exe_dir.join(sidecar_name));

            if let Some(parent1) = exe_dir.parent() {
                candidates.push(parent1.join("binaries").join(sidecar_name));
                candidates.push(parent1.join("src-tauri").join("binaries").join(sidecar_name));

                if let Some(parent2) = parent1.parent() {
                    candidates.push(parent2.join("binaries").join(sidecar_name));
                    candidates.push(parent2.join("src-tauri").join("binaries").join(sidecar_name));
                }
            }
        }
    }

    // 3. Relative to current working directory
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("binaries").join(sidecar_name));
        candidates.push(current_dir.join("src-tauri").join("binaries").join(sidecar_name));
        if let Some(p1) = current_dir.parent() {
            candidates.push(p1.join("binaries").join(sidecar_name));
            candidates.push(p1.join("src-tauri").join("binaries").join(sidecar_name));
        }
    }

    for path in candidates {
        if path.exists() {
            log::info!("Found sidecar binary at: {:?}", path);
            return Ok(path);
        }
    }

    Err(format!("Sidecar {} not found", sidecar_name))
}

fn start_backend_process(app: &AppHandle, auth_token: &str) -> Result<std::process::Child, String> {
    let sidecar_path = get_sidecar_path(app)?;
    
    log::info!("Starting backend sidecar: {:?}", sidecar_path);
    
    let mut command = Command::new(&sidecar_path);
    
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    command
        .env("NAUTILUS_AUTH_TOKEN", auth_token)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let auth_token = generate_auth_token();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            backend_process: Arc::new(Mutex::new(None)),
            auth_token: auth_token.clone(),
        })
        .setup(move |app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_handle = app.handle().clone();
            let state = app.state::<AppState>().inner().clone();
            let token_clone = auth_token.clone();
            
            // Start backend sidecar asynchronously
            tauri::async_runtime::spawn(async move {
                match start_backend_process(&app_handle, &token_clone) {
                    Ok(child) => {
                        log::info!("Backend sidecar started with PID: {}", child.id());
                        
                        // Store the process handle
                        let mut backend = state.backend_process.lock().await;
                        *backend = Some(child);
                        
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to start backend sidecar: {}", e);
                        // Show window anyway
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                        }
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill backend when window closes
                let state = window.state::<AppState>().inner().clone();
                tauri::async_runtime::block_on(async move {
                    let mut backend = state.backend_process.lock().await;
                    if let Some(ref mut child) = *backend {
                        let _ = child.kill();
                        log::info!("Backend sidecar terminated");
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            win_minimize,
            win_maximize,
            win_close,
            win_toggle_maximize,
            show_window,
            get_auth_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

