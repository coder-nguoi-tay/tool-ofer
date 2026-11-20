//! Numeric diagnostics scoped to one navigation task. Concurrent tabs never share timestamps.
use std::{cell::Cell, rc::Rc, time::Instant};

#[derive(Clone, Copy)]
pub struct NavigationTrace {
    pub phase: &'static str,
    pub request: Option<Instant>,
    pub headers: Option<Instant>,
    pub body: Option<Instant>,
    pub status: u16,
}

impl Default for NavigationTrace {
    /// @return An empty trace before the first request.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-20
    fn default() -> Self {
        Self { phase: "prepare", request: None, headers: None, body: None, status: 0 }
    }
}

tokio::task_local! {
    pub static ACTIVE: Rc<Cell<NavigationTrace>>;
}

/// Record the current document stage without retaining request data.
/// @param phase Fixed internal stage name. @return Updates only the active navigation.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub fn stage(phase: &'static str) {
    let _ = ACTIVE.try_with(|trace| {
        let mut progress = if phase == "document" { NavigationTrace::default() } else { trace.get() };
        progress.phase = phase;
        trace.set(progress);
    });
}

/// Record a fully read document, including local and intercepted responses.
/// @param status Response status. @return Marks the start of parsing in the active trace.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub fn document_received(status: u16) {
    let _ = ACTIVE.try_with(|trace| {
        let mut progress = trace.get();
        progress.status = status;
        progress.phase = "parse";
        progress.body = Some(Instant::now());
        trace.set(progress);
    });
}

/// Record dispatch and header receipt for the main HTTP exchange, including redirect hops.
/// @param status None before sending, or the actual status before reading the response body.
/// @return Updates only the main document currently being fetched.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-20
pub(crate) fn document_exchange(status: Option<u16>) {
    let _ = ACTIVE.try_with(|trace| {
        let mut progress = trace.get();
        if !matches!(progress.phase, "document" | "headers" | "body") { return; }
        if let Some(status) = status {
            progress.phase = "body";
            progress.status = status;
            progress.headers = Some(Instant::now());
        } else {
            progress = NavigationTrace { phase: "headers", request: Some(Instant::now()), ..Default::default() };
        }
        trace.set(progress);
    });
}
