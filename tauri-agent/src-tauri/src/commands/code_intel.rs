// One-shot CodeGraph CLI invocations backing the Code Intelligence management UI
// (status / init / sync / reindex) plus an init-state probe.
//
// CodeGraph ships as a directory bundle (a vendored Node runtime + lib/dist + a
// bin launcher), NOT a single-file binary, so it cannot be a tauri externalBin
// sidecar. build-codegraph.mjs places it under src-tauri/binaries/codegraph and
// tauri.conf.json ships it via `bundle.resources`. We resolve the bundle dir
// (packaged resource first, dev binaries/ fallback) and run the platform
// launcher directly:
//   unix : <dir>/bin/codegraph <args>
//   win32: <dir>/node.exe --liftoff-only <dir>/lib/dist/bin/codegraph.js <args>
// (Windows cannot spawn the bundle's .cmd directly — CVE-2024-27980 hardening —
//  so we invoke the bundled node.exe against the app entry; --liftoff-only also
//  keeps tree-sitter's WASM grammars off V8's turboshaft tier to avoid an OOM.)
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Resolve the CodeGraph bundle directory: packaged resource first (prod),
/// then the dev build output (src-tauri/binaries/codegraph).
fn codegraph_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(p) = app
        .path()
        .resolve("binaries/codegraph", tauri::path::BaseDirectory::Resource)
    {
        if p.is_dir() {
            return p;
        }
    }
    crate::pi::sidecar::pi_package_dir().join("codegraph")
}

/// (program, leading-args) for the bundled launcher on this platform.
fn launcher(dir: &Path) -> (PathBuf, Vec<String>) {
    if cfg!(windows) {
        (
            dir.join("node.exe"),
            vec![
                "--liftoff-only".to_string(),
                dir.join("lib")
                    .join("dist")
                    .join("bin")
                    .join("codegraph.js")
                    .to_string_lossy()
                    .to_string(),
            ],
        )
    } else {
        (dir.join("bin").join("codegraph"), Vec::new())
    }
}

async fn run_codegraph(
    app: &tauri::AppHandle,
    workspace: &str,
    args: &[&str],
) -> Result<String, String> {
    let dir = codegraph_dir(app);
    let (program, mut full_args) = launcher(&dir);
    full_args.extend(args.iter().map(|s| s.to_string()));
    let output = tokio::process::Command::new(&program)
        .args(&full_args)
        .current_dir(Path::new(workspace))
        .output()
        .await
        .map_err(|e| format!("codegraph spawn failed ({}): {e}", program.display()))?;
    if !output.status.success() {
        return Err(format!(
            "codegraph {:?} exited ({:?}): {}",
            args,
            output.status.code(),
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Index status + statistics (`codegraph status <ws>`), human-readable text.
#[tauri::command]
pub async fn code_intel_status(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &workspace, &["status", workspace.as_str()]).await
}

/// Initialize CodeGraph and build the initial index (`codegraph init <ws>`).
/// Idempotent: re-running on an initialized project is a no-op/refresh upstream.
#[tauri::command]
pub async fn code_intel_init(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &workspace, &["init", workspace.as_str()]).await
}

/// Incremental sync since last index (`codegraph sync <ws>`).
#[tauri::command]
pub async fn code_intel_sync(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &workspace, &["sync", workspace.as_str()]).await
}

/// Full rebuild (`codegraph index -f <ws>`).
#[tauri::command]
pub async fn code_intel_reindex(app: tauri::AppHandle, workspace: String) -> Result<String, String> {
    run_codegraph(&app, &workspace, &["index", "-f", workspace.as_str()]).await
}

/// Whether the workspace already has an index (presence of `.codegraph/`).
#[tauri::command]
pub async fn code_intel_is_initialized(workspace: String) -> Result<bool, String> {
    Ok(Path::new(&workspace).join(".codegraph").is_dir())
}
