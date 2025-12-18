use std::process::{Command, Stdio};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::Arc;
use tauri::{Manager, WebviewWindow, AppHandle};
use tokio::sync::Mutex;

// State to track if backend is running
pub struct AppState {
    pub backend_process: Arc<Mutex<Option<std::process::Child>>>,
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        AppState {
            backend_process: Arc::clone(&self.backend_process),
        }
    }
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

fn get_sidecar_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    let sidecar_name = "nautilus-backend-x86_64-pc-windows-msvc.exe";
    
    #[cfg(target_os = "linux")]
    let sidecar_name = "nautilus-backend-x86_64-unknown-linux-gnu";
    
    #[cfg(target_os = "macos")]
    let sidecar_name = "nautilus-backend-x86_64-apple-darwin";
    
    // Try resource dir first (production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let sidecar_path = resource_dir.join("binaries").join(sidecar_name);
        if sidecar_path.exists() {
            return Ok(sidecar_path);
        }
    }
    
    // Fallback for development
    if let Ok(current_dir) = std::env::current_dir() {
        let dev_path = current_dir.join("binaries").join(sidecar_name);
        if dev_path.exists() {
            return Ok(dev_path);
        }
        
        // Try src-tauri/binaries
        let dev_path2 = current_dir.join("src-tauri").join("binaries").join(sidecar_name);
        if dev_path2.exists() {
            return Ok(dev_path2);
        }
    }
    
    Err(format!("Sidecar {} not found", sidecar_name))
}

fn start_backend_process(app: &AppHandle) -> Result<std::process::Child, String> {
    let sidecar_path = get_sidecar_path(app)?;
    
    log::info!("Starting backend sidecar: {:?}", sidecar_path);
    
    let mut command = Command::new(&sidecar_path);
    
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start backend: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            backend_process: Arc::new(Mutex::new(None)),
        })
        .setup(|app| {
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
            
            // Start backend sidecar in a separate thread
            std::thread::spawn(move || {
                match start_backend_process(&app_handle) {
                    Ok(child) => {
                        log::info!("Backend sidecar started with PID: {}", child.id());
                        
                        // Store the process handle
                        let state_clone = state.clone();
                        let rt = tokio::runtime::Runtime::new().unwrap();
                        rt.block_on(async {
                            let mut backend = state_clone.backend_process.lock().await;
                            *backend = Some(child);
                        });
                        
                        // Wait a bit for backend to start, then show window
                        std::thread::sleep(std::time::Duration::from_millis(1500));
                        
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
                let state = window.state::<AppState>();
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
