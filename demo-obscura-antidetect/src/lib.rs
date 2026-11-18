//! Native device-profile configuration and CDP controls for Obscura.
//! Browser identity is stored in Rust. The legacy script API emits no page patches.

pub mod cdp_bridge;
pub mod engine_hook;
pub mod generator;
pub mod noise;
pub mod profile;
pub mod stealth_script;

pub use cdp_bridge::CdpBridge;
pub use engine_hook::ObscuraEngineHook;
pub use generator::{generate_profile, TargetOs, CHROME_VERSION_POOL};
pub use noise::XorShift64;
pub use profile::AntiDetectProfile;
pub use stealth_script::generate_stealth_js;
