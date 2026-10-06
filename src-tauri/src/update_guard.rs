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
///
/// Read only the third line. minisign-verify authenticates that line and no other, so a
/// `trusted comment:` on any other line can be forged. Decode the same way as the updater.
pub fn signed_at(signature: &str) -> Option<u64> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(signature)
        .ok()?;
    let text = String::from_utf8(decoded).ok()?;
    let comment = text.lines().nth(2)?.strip_prefix("trusted comment: ")?;
    comment
        .split('\t')
        .find_map(|field| field.strip_prefix("timestamp:"))?
        .parse()
        .ok()
}

/// Whether every signature in `release` was made after `built_at`.
///
/// Check every entry, not only this platform's. The updater picks an entry by installer type
/// first (`windows-x86_64-nsis` before `windows-x86_64`), and the guard must not check a
/// different entry from the one it installs. One CI run signs every entry of a real release, so
/// all of them pass.
pub fn signed_after_build(release: &RemoteRelease, built_at: u64) -> bool {
    let fresh = |signature: &str| {
        signed_at(signature)
            .is_some_and(|signed| signed.saturating_add(CLOCK_SKEW_SECS) >= built_at)
    };
    match &release.data {
        RemoteReleaseInner::Dynamic(platform) => fresh(&platform.signature),
        RemoteReleaseInner::Static { platforms } => {
            !platforms.is_empty() && platforms.values().all(|p| fresh(&p.signature))
        }
    }
}

/// Whether every signature in `release` was made after this app was built.
pub fn signed_after_this_build(release: &RemoteRelease) -> bool {
    signed_after_build(release, built_at())
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
    fn a_trusted_comment_on_another_line_is_ignored() {
        // minisign-verify does not authenticate line 1, so an attacker can write anything there.
        let text = "trusted comment: timestamp:9999999999\nRUQ=\ntrusted comment: timestamp:500\tfile:a\nAAAA\n";
        let sig = base64::engine::general_purpose::STANDARD.encode(text);
        assert_eq!(signed_at(&sig), Some(500));
        let text = "untrusted comment: x\nRUQ=\nAAAA\ntrusted comment: timestamp:9999999999\n";
        let sig = base64::engine::general_purpose::STANDARD.encode(text);
        assert_eq!(signed_at(&sig), None);
    }

    #[test]
    fn a_release_signed_after_this_build_passes() {
        let r = release("0.2.0", &[("darwin-aarch64", "timestamp:2000\tfile:a")]);
        assert!(signed_after_build(&r, 1000));
    }

    #[test]
    fn an_older_release_relabelled_as_newer_is_refused() {
        let r = release("9.9.9", &[("darwin-aarch64", "timestamp:500\tfile:a")]);
        assert!(!signed_after_build(&r, 1000));
    }

    #[test]
    fn clock_skew_within_five_minutes_passes() {
        let r = release("0.2.0", &[("linux-x86_64", "timestamp:900\tfile:a")]);
        assert!(signed_after_build(&r, 1000));
        assert!(!signed_after_build(&r, 1301));
    }

    #[test]
    fn a_signature_without_a_timestamp_is_refused() {
        let r = release("0.2.0", &[("linux-x86_64", "file:a")]);
        assert!(!signed_after_build(&r, 1000));
    }

    #[test]
    fn every_entry_must_be_fresh() {
        // A fresh base entry must not hide an old installer-specific entry.
        let r = release(
            "0.2.0",
            &[
                ("windows-x86_64", "timestamp:2000\tfile:a"),
                ("windows-x86_64-nsis", "timestamp:500\tfile:b"),
            ],
        );
        assert!(!signed_after_build(&r, 1000));
        let r = release(
            "0.2.0",
            &[
                ("darwin-aarch64", "timestamp:2000\tfile:a"),
                ("linux-x86_64", "timestamp:1900\tfile:b"),
            ],
        );
        assert!(signed_after_build(&r, 1000));
        assert!(!signed_after_build(&release("0.2.0", &[]), 1000));
    }

    #[test]
    fn a_zero_build_time_turns_the_check_off() {
        let r = release("0.2.0", &[("linux-x86_64", "timestamp:1\tfile:a")]);
        assert!(signed_after_build(&r, 0));
    }

    #[test]
    fn the_build_time_is_set() {
        assert!(built_at() > 1_700_000_000);
    }
}
