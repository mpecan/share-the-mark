use std::env;
use std::fs;
use std::path::{Path, PathBuf};

// Bake the embed artifacts into the binary at compile time (SPEC §13): the Channel-C
// bundle (local.global.js) and the Channel-A Playwright runner (playwright-runner.mjs).
// Both are built by `pnpm build:embed` (esbuild) and are NOT committed; mise tasks
// ensure they exist before `cargo build`. Each is copied into OUT_DIR so an
// `include_bytes!(concat!(env!("OUT_DIR"), "/<name>"))` always has a target on an
// OS-native path (no hand-written absolute / Windows backslash hazard). A missing
// artifact becomes an empty placeholder + warning, so a bare `cargo build` /
// rust-analyzer / `cargo install`-without-vendor still compiles.
fn main() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR is set by cargo"));

    println!("cargo:rerun-if-env-changed=SHARE_THE_MARK_EMBED_BUNDLE");
    println!("cargo:rerun-if-env-changed=SHARE_THE_MARK_REQUIRE_EMBED");
    println!("cargo:rerun-if-changed=build.rs");
    for name in ["local.global.js", "playwright-runner.mjs"] {
        println!("cargo:rerun-if-changed=embed/{name}");
        println!("cargo:rerun-if-changed=../.output/embed/{name}");
    }

    // The Channel-C bundle honours an explicit `--bundle`/env override; the runner has
    // no override (it's purely a build artifact).
    bake(
        &out_dir,
        "local.global.js",
        &[
            env::var_os("SHARE_THE_MARK_EMBED_BUNDLE").map(PathBuf::from),
            Some(manifest.join("embed/local.global.js")),
            Some(manifest.join("../.output/embed/local.global.js")),
        ],
    );
    bake(
        &out_dir,
        "playwright-runner.mjs",
        &[
            Some(manifest.join("embed/playwright-runner.mjs")),
            Some(manifest.join("../.output/embed/playwright-runner.mjs")),
        ],
    );
}

/// Copy the first existing candidate into `OUT_DIR/<name>`. With none found, a
/// shipping build (`SHARE_THE_MARK_REQUIRE_EMBED` set) fails loud; otherwise an empty
/// placeholder is written + a `cargo:warning` emitted so bare builds still compile.
fn bake(out_dir: &Path, name: &str, candidates: &[Option<PathBuf>]) {
    let dest = out_dir.join(name);
    match candidates.iter().flatten().find(|p| p.is_file()) {
        Some(src) => {
            fs::copy(src, &dest)
                .unwrap_or_else(|e| panic!("could not copy embed artifact {}: {e}", src.display()));
        }
        None => {
            assert!(
                env::var_os("SHARE_THE_MARK_REQUIRE_EMBED").is_none(),
                "share-the-mark: embed artifact {name} required but not found. Run \
                 `mise run build:embed` (or vendor it to cli/embed/{name}) before this build."
            );
            fs::write(&dest, b"").expect("could not write placeholder embed artifact");
            println!(
                "cargo:warning=share-the-mark: embed artifact {name} not found — baked an empty \
                 placeholder. Run `mise run build:embed` for a working build."
            );
        }
    }
}
