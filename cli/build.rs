use std::env;
use std::fs;
use std::path::PathBuf;

// Bake the Channel-C embed bundle (local.global.js) into the binary at compile time
// (SPEC §13.6). The bundle is built by `pnpm build:embed` (esbuild) and is NOT
// committed; mise tasks ensure it exists before `cargo build`. We copy the resolved
// bundle into OUT_DIR so `include_bytes!(concat!(env!("OUT_DIR"), "/local.global.js"))`
// always has a target, and the include path is an OS-native one Cargo produced (no
// hand-written absolute path / Windows backslash hazard). If no bundle is found we
// write an empty placeholder and warn, so a bare `cargo build` / rust-analyzer /
// `cargo install`-without-vendor still compiles.
fn main() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dest = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by cargo"))
        .join("local.global.js");

    // A change to any candidate (incl. one appearing/disappearing) re-runs this script.
    println!("cargo:rerun-if-env-changed=SHARE_THE_MARK_EMBED_BUNDLE");
    println!("cargo:rerun-if-env-changed=SHARE_THE_MARK_REQUIRE_EMBED");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=embed/local.global.js");
    println!("cargo:rerun-if-changed=../.output/embed/local.global.js");

    // Precedence: explicit build-time env → vendored in-crate copy (published crates +
    // release jobs) → the workspace esbuild output (dev / CI-from-git).
    let candidates = [
        env::var_os("SHARE_THE_MARK_EMBED_BUNDLE").map(PathBuf::from),
        Some(manifest.join("embed/local.global.js")),
        Some(manifest.join("../.output/embed/local.global.js")),
    ];

    match candidates.into_iter().flatten().find(|p| p.is_file()) {
        Some(src) => {
            fs::copy(&src, &dest)
                .unwrap_or_else(|e| panic!("could not copy embed bundle {}: {e}", src.display()));
        }
        None => {
            // Shipping builds (release / publish / install) set SHARE_THE_MARK_REQUIRE_EMBED
            // so a missing bundle fails loud at the build, not silently as an empty binary.
            // Bare `cargo build` / rust-analyzer / crates.io consumers leave it unset and get
            // a compilable placeholder + warning.
            assert!(
                env::var_os("SHARE_THE_MARK_REQUIRE_EMBED").is_none(),
                "share-the-mark: embed bundle required but not found. Run `mise run build:embed` \
                 (or vendor it to cli/embed/local.global.js) before this build."
            );
            fs::write(&dest, b"").expect("could not write placeholder embed bundle");
            println!(
                "cargo:warning=share-the-mark: embed bundle not found — baked an empty \
                 placeholder. Run `mise run build:embed` for a working local-serve."
            );
        }
    }
}
