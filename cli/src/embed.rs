//! The Channel-C embed bundle (`local.global.js`), baked in at compile time by
//! `build.rs`. Empty when the binary is built without the bundle present (the
//! placeholder fallback); in that case the daemon still starts and the embed route
//! just serves empty JS until rebuilt with `mise run build:embed`.
pub const EMBED_BUNDLE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/local.global.js"));
