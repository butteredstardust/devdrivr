//! Refuse an update whose signature is older than this build.
//!
//! The updater verifies each download against the public key in `tauri.conf.json`, so a changed
//! manifest cannot install an unsigned app. The manifest's `version` is not signed, though. A
//! changed manifest can label an older, validly signed release as a newer version, and the
//! updater then installs it: a downgrade.
//!
//! Each Tauri signature has a trusted comment, `timestamp:<unix seconds>\tfile:<name>`. The
//! updater verifies that comment together with the download, so its timestamp is authentic. A
//! release signed before this build is never newer than this build, so this module refuses it.

use base64::Engine;
use tauri_plugin_updater::{RemoteRelease, RemoteReleaseInner};

/// Unix seconds when this binary was built, from build.rs. Zero turns the check off.
pub fn built_at() -> u64 {
    env!("DEVDRIVR_BUILT_AT").parse().unwrap_or(0)
}

/// Clock difference allowed between the machine that built this app and the one that signed
/// the next release.
const CLOCK_SKEW_SECS: u64 = 300;

/// The signing time in a Tauri signature: base64 of a minisign `.sig` file.
pub fn signed_at(signature: &str) -> Option<u64> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(signature.trim())
        .ok()?;
    let text = String::from_utf8(decoded).ok()?;
    let comment = text
        .lines()
        .find_map(|line| line.strip_prefix("trusted comment: "))?;
    comment
        .split('\t')
        .find_map(|field| field.strip_prefix("timestamp:"))?
        .parse()
        .ok()
}

/// The manifest key for this platform, as the updater names it: `darwin-aarch64` and so on.
fn this_target() -> String {
    let os = if cfg!(target_os = "macos") {
        "darwin"
    } else {
        std::env::consts::OS
    };
    format!("{os}-{}", std::env::consts::ARCH)
}

/// Whether every signature that can reach this platform was made after `built_at`. Without an
/// entry for this platform, every entry must pass.
pub fn signed_after_build(release: &RemoteRelease, target: &str, built_at: u64) -> bool {
    let fresh = |signature: &str| {
        signed_at(signature)
            .is_some_and(|signed| signed.saturating_add(CLOCK_SKEW_SECS) >= built_at)
    };
    match &release.data {
        RemoteReleaseInner::Dynamic(platform) => fresh(&platform.signature),
        RemoteReleaseInner::Static { platforms } => match platforms.get(target) {
            Some(platform) => fresh(&platform.signature),
            None => !platforms.is_empty() && platforms.values().all(|p| fresh(&p.signature)),
        },
    }
}

/// Whether `release` was signed after this build, for this platform.
pub fn signed_after_this_build(release: &RemoteRelease) -> bool {
    signed_after_build(release, &this_target(), built_at())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tauri_plugin_updater::ReleaseManifestPlatform;

    /// A Tauri signature with this trusted comment. Only the comment matters here: the updater
    /// verifies the signature itself when it installs.
    fn signature(comment: &str) -> String {
        let text = format!(
            "untrusted comment: signature from tauri secret key\nRUQ=\ntrusted comment: {comment}\nAAAA\n"
        );
        base64::engine::general_purpose::STANDARD.encode(text)
    }

    fn platform(comment: &str) -> ReleaseManifestPlatform {
        ReleaseManifestPlatform {
            url: "https://example.test/app.tar.gz".parse().unwrap(),
            signature: signature(comment),
        }
    }

    fn release(version: &str, platforms: &[(&str, &str)]) -> RemoteRelease {
        let platforms: HashMap<String, ReleaseManifestPlatform> = platforms
            .iter()
            .map(|(target, comment)| (target.to_string(), platform(comment)))
            .collect();
        RemoteRelease {
            version: version.parse().unwrap(),
            notes: None,
            pub_date: None,
            data: RemoteReleaseInner::Static { platforms },
        }
    }

    #[test]
    fn reads_the_timestamp_of_a_tauri_signature() {
        let sig = signature("timestamp:1790706234\tfile:devdrivr.app.tar.gz");
        assert_eq!(signed_at(&sig), Some(1_790_706_234));
        assert_eq!(signed_at(&signature("file:devdrivr.app.tar.gz")), None);
        assert_eq!(signed_at("not base64!"), None);
    }

    #[test]
    fn a_release_signed_after_this_build_passes() {
        let r = release("0.2.0", &[("darwin-aarch64", "timestamp:2000\tfile:a")]);
        assert!(signed_after_build(&r, "darwin-aarch64", 1000));
    }

    #[test]
    fn an_older_release_relabelled_as_newer_is_refused() {
        let r = release("9.9.9", &[("darwin-aarch64", "timestamp:500\tfile:a")]);
        assert!(!signed_after_build(&r, "darwin-aarch64", 1000));
    }

    #[test]
    fn clock_skew_within_five_minutes_passes() {
        let r = release("0.2.0", &[("linux-x86_64", "timestamp:900\tfile:a")]);
        assert!(signed_after_build(&r, "linux-x86_64", 1000));
        assert!(!signed_after_build(&r, "linux-x86_64", 1301));
    }

    #[test]
    fn a_signature_without_a_timestamp_is_refused() {
        let r = release("0.2.0", &[("linux-x86_64", "file:a")]);
        assert!(!signed_after_build(&r, "linux-x86_64", 1000));
    }

    #[test]
    fn only_this_platform_counts_when_present() {
        let r = release(
            "0.2.0",
            &[
                ("darwin-aarch64", "timestamp:2000\tfile:a"),
                ("linux-x86_64", "timestamp:500\tfile:b"),
            ],
        );
        assert!(signed_after_build(&r, "darwin-aarch64", 1000));
        assert!(!signed_after_build(&r, "linux-x86_64", 1000));
        // No entry for this platform: every entry must pass.
        assert!(!signed_after_build(&r, "windows-x86_64", 1000));
    }

    #[test]
    fn a_zero_build_time_turns_the_check_off() {
        let r = release("0.2.0", &[("linux-x86_64", "timestamp:1\tfile:a")]);
        assert!(signed_after_build(&r, "linux-x86_64", 0));
    }

    #[test]
    fn this_target_matches_the_manifest_keys() {
        let expected = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            "darwin-aarch64"
        } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
            "linux-x86_64"
        } else if cfg!(all(windows, target_arch = "x86_64")) {
            "windows-x86_64"
        } else {
            return;
        };
        assert_eq!(this_target(), expected);
    }

    #[test]
    fn the_build_time_is_set() {
        assert!(built_at() > 1_700_000_000);
    }
}
