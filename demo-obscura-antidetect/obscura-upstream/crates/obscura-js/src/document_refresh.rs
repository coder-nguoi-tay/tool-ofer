//! Declarative document refresh, owned by the browser rather than injected MutationObservers.
use std::time::{Duration, Instant};
use obscura_dom::DomTree;

#[derive(Default)]
pub(crate) struct DocumentRefresh {
    observed_revision: Option<u64>,
    loaded_at: Option<Instant>,
    scheduled: Option<(Instant, Duration, String)>,
    pending: Option<(Instant, String)>,
    fired: bool,
}

impl DocumentRefresh {
    /// Observe the connected document when it changes, retaining an already scheduled deadline.
    /// @param dom Live document. @param base Current document/base URL. @param revision Native DOM activity revision.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub(crate) fn observe(&mut self, dom: &DomTree, document_url: &str, base: &str, revision: u64) {
        if self.fired || self.observed_revision == Some(revision) { return; }
        self.observed_revision = Some(revision);
        let base = dom.query_selector("base[href]").ok().flatten().and_then(|node| dom.with_node(node, |node| node.get_attribute("href").map(str::to_owned)).flatten()).and_then(|href| url::Url::parse(base).ok()?.join(&href).ok()).map(|url| url.to_string()).unwrap_or_else(|| base.to_string());
        let refresh = dom.query_selector_all("meta").unwrap_or_default().into_iter().filter_map(|node| {
            dom.with_node(node, |node| {
                if !node.get_attribute("http-equiv").is_some_and(|value| value.eq_ignore_ascii_case("refresh")) { return None; }
                parse_refresh(node.get_attribute("content")?, &base, document_url)
            }).flatten()
        }).min_by_key(|(delay, _)| *delay);
        let Some((delay, destination)) = refresh else { return; };
        // A processed refresh remains scheduled after its element is removed.
        if self.scheduled.as_ref().is_some_and(|(_, previous, _)| *previous <= delay) { return; }
        self.scheduled = Some((Instant::now(), delay, destination));
        self.arm();
    }

    /// Start refresh countdowns only after this document has completed loading.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub(crate) fn mark_loaded(&mut self) {
        if self.loaded_at.is_none() { self.loaded_at = Some(Instant::now()); self.arm(); }
    }

    /// Anchor the timer after both meta processing and document load completion.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    fn arm(&mut self) {
        if let (Some(loaded), Some((observed, delay, destination))) = (self.loaded_at, self.scheduled.as_ref()) {
            self.pending = loaded.max(*observed).checked_add(*delay).map(|deadline| (deadline, destination.clone()));
        }
    }

    /// Cancel any scheduled or pending document refresh immediately.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub(crate) fn cancel(&mut self) {
        self.pending = None;
        self.scheduled = None;
        self.fired = true;
    }

    /// Return the native timer deadline so an idle renderer can park without polling.
    /// @return Scheduled deadline. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub(crate) fn deadline(&self) -> Option<Instant> { self.pending.as_ref().map(|(deadline, _)| *deadline) }

    /// Consume a due refresh once, leaving request handling/security to ordinary navigation.
    /// @return Destination when its timer expires. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub(crate) fn take_due(&mut self) -> Option<String> {
        if self.deadline().is_some_and(|deadline| deadline <= Instant::now()) {
            self.fired = true;
            return self.pending.take().map(|(_, url)| url);
        }
        None
    }
}

/// Parse an HTML refresh delay and resolve its URL against the document's real base.
/// @param content Meta content attribute. @param base Document base URL.
/// @return A supported delay/URL, or None for malformed/unsafe refresh content.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn parse_refresh(content: &str, base: &str, document_url: &str) -> Option<(Duration, String)> {
    let content = content.trim();
    let digits = content.bytes().take_while(u8::is_ascii_digit).count();
    if digits == 0 { return None; }
    let delay = content[..digits].parse::<u64>().ok()?;
    let mut remainder = content[digits..].trim_start();
    if remainder.starts_with('.') { remainder = remainder[1..].trim_start_matches(|character: char| character.is_ascii_digit()).trim_start(); }
    let destination = if remainder.is_empty() { document_url } else {
        remainder = remainder.strip_prefix(';').or_else(|| remainder.strip_prefix(','))?.trim_start();
        if remainder.get(..3).is_some_and(|prefix| prefix.eq_ignore_ascii_case("url")) {
            remainder = remainder[3..].trim_start().strip_prefix('=')?.trim_start();
        }
        remainder.trim_matches(|character| character == '\'' || character == '"').trim()
    };
    let url = url::Url::parse(base).ok()?.join(if destination.is_empty() { document_url } else { destination }).ok()?;
    if !matches!(url.scheme(), "http" | "https") && url.as_str() != "about:blank" { return None; }
    Some((Duration::from_secs(delay), url.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use obscura_dom::parse_html;

    /// Native parsing preserves quotes, tracking parameters and the document base, rejecting script schemes.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn refresh_parser_resolves_relative_urls_and_rejects_invalid_content() {
        assert_eq!(parse_refresh("0; URL = 'next?q=1;x=2'", "https://fixture.invalid/base/", "https://fixture.invalid/").unwrap().1, "https://fixture.invalid/base/next?q=1;x=2");
        assert_eq!(parse_refresh("3", "https://fixture.invalid/base/", "https://fixture.invalid/page").unwrap().1, "https://fixture.invalid/page");
        assert!(parse_refresh("soon;url=/next", "https://fixture.invalid/", "https://fixture.invalid/").is_none());
        assert!(parse_refresh("0;url=javascript:alert(1)", "https://fixture.invalid/", "https://fixture.invalid/").is_none());
    }

    /// A renderer activity tick must not restart the same declarative timer.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn refresh_deadline_survives_unrelated_mutations_and_is_consumed_once() {
        let dom = parse_html("<head><base href='/base/'><meta http-equiv='refresh' content='0;url=next'></head>");
        let mut refresh = DocumentRefresh::default();
        refresh.observe(&dom, "https://fixture.invalid/", "https://fixture.invalid/", 1);
        assert_eq!(refresh.deadline(), None, "refresh waits for document load");
        refresh.mark_loaded();
        let deadline = refresh.deadline();
        refresh.observe(&dom, "https://fixture.invalid/", "https://fixture.invalid/", 2);
        assert_eq!(deadline, refresh.deadline());
        assert_eq!(refresh.take_due().as_deref(), Some("https://fixture.invalid/base/next"));
        assert_eq!(refresh.take_due(), None);
    }
    /// Meta processing survives deletion and skips malformed earlier declarations.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn refresh_skips_invalid_meta_and_retains_schedule_after_removal() {
        let dom = parse_html("<head><meta http-equiv='refresh' content='invalid'><meta http-equiv='refresh' content='0;url=/next'></head>");
        let mut refresh = DocumentRefresh::default();
        refresh.observe(&dom, "https://fixture.invalid/", "https://fixture.invalid/", 1);
        refresh.observe(&parse_html("<head></head>"), "https://fixture.invalid/", "https://fixture.invalid/", 2);
        refresh.mark_loaded();
        assert_eq!(refresh.take_due().as_deref(), Some("https://fixture.invalid/next"));
    }

    /// Slow parser-blocking work must not consume the refresh countdown.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn refresh_countdown_is_anchored_after_load() {
        let dom = parse_html("<meta http-equiv='refresh' content='1;url=/next'>");
        let mut refresh = DocumentRefresh::default();
        refresh.observe(&dom, "https://fixture.invalid/", "https://fixture.invalid/", 1);
        refresh.scheduled.as_mut().unwrap().0 = Instant::now() - Duration::from_secs(5);
        assert_eq!(refresh.take_due(), None);
        refresh.mark_loaded();
        assert!(refresh.deadline().unwrap() > Instant::now());
        assert_eq!(refresh.take_due(), None);
    }

    /// Explicit cancellation clears pending refresh immediately.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn refresh_cancel_clears_pending_destination() {
        let dom = parse_html("<meta http-equiv='refresh' content='0;url=/next'>");
        let mut refresh = DocumentRefresh::default();
        refresh.observe(&dom, "https://fixture.invalid/", "https://fixture.invalid/", 1);
        refresh.mark_loaded();
        assert!(refresh.deadline().is_some());
        refresh.cancel();
        assert_eq!(refresh.deadline(), None);
        assert_eq!(refresh.take_due(), None);
    }

}
