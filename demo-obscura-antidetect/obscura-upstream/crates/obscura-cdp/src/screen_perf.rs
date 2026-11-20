use std::sync::OnceLock;
use std::time::Instant;

// A closed diagnostic pipe must not unwind the renderer.
macro_rules! log {
    ($($args:tt)*) => {{
        use std::io::Write as _;
        let _ = writeln!(std::io::stderr().lock(), $($args)*);
    }};
}
pub(crate) use log;

/// Enable numeric Screen View timings for this engine process.
/// @return True when explicitly enabled at launch.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub(crate) fn enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| std::env::var_os("AUTOLEADPC_OBSCURA_PERF").as_deref() == Some("1".as_ref()))
}

#[derive(Clone, Copy)]
pub(crate) struct CommandTiming {
    pub id: u64,
    pub method: &'static str,
    pub received: Instant,
}

/// Read only the envelope of a command used to navigate or switch Screen View.
/// @param text Wire message.
/// @return Timing for a known command, or None for all other traffic.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub(crate) fn command(text: &str) -> Option<CommandTiming> {
    if !enabled() { return None; }
    #[derive(serde::Deserialize)]
    struct Envelope<'a> { method: &'a str, id: u64 }
    let envelope: Envelope = serde_json::from_str(text).ok()?;
    let method = match envelope.method {
        "Target.attachToTarget" => "attach",
        "Target.detachFromTarget" => "detach",
        "Page.startScreencast" => "start_stream",
        "Page.stopScreencast" => "stop_stream",
        "Page.navigate" => "navigate",
        "Page.reload" => "reload",
        _ => return None,
    };
    Some(CommandTiming { id: envelope.id, method, received: Instant::now() })
}

/// Convert an engine-owned page id to a numeric log label.
/// @param id Internal page id. @return Monotonic page number, or zero for a non-page target.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub(crate) fn tab(id: &str) -> u64 {
    id.strip_prefix("page-").and_then(|n| n.parse().ok()).unwrap_or(0)
}
