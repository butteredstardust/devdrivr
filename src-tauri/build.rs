fn main() {
    // The updater refuses a release signed before this time: see src/update_guard.rs.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    println!("cargo:rustc-env=DEVDRIVR_BUILT_AT={now}");
    tauri_build::build()
}
