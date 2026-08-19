use std::process::Command;

/// Embeds the short git commit hash of the current checkout into the binary
/// as the `GIT_HASH` compile-time env var (read via `env!("GIT_HASH")` in
/// lib.rs). Falls back to "unknown" if git isn't available (e.g. a source
/// tarball with no .git directory) rather than failing the build.
fn main() {
    let hash = Command::new("git")
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=GIT_HASH={hash}");

    // Re-run when the commit changes (new commit, checkout, or pull) so the
    // embedded hash never goes stale across builds that don't touch rust/.
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-changed=../.git/index");
}
