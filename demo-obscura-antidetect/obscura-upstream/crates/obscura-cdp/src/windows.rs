//! Native ownership of auxiliary browsing contexts and their navigation queues.
use std::collections::{HashMap, HashSet, VecDeque};
use serde_json::{json, Value};
use crate::dispatch::CdpContext;
use crate::types::CdpEvent;

#[derive(Default)]
pub(crate) struct AuxiliaryWindows {
    pub auto_attach: bool,
    pub waiting: HashSet<String>,
    references: HashMap<(String, String), String>,
    names: HashMap<(String, String), String>,
    openers: HashMap<String, (String, String)>,
    identities: HashMap<String, String>,
    navigations: VecDeque<(String, Value)>,
}

/// Deliver an engine control update in every live realm of one page.
/// @param ctx Owning browser context. @param page_id Recipient. @param update State or message.
/// @return No value; a retired realm is ignored. @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn notify(ctx: &mut CdpContext, page_id: &str, update: Value) {
    let script = format!("dispatchEvent(new CustomEvent('__obscura_auxiliary_control',{{detail:{update}}}))");
    if let Some(page) = ctx.get_page_mut(page_id) {
        let _ = page.execute_preload_script(&script);
        if let Some(js) = &mut page.js {
            for frame in &page.frames { let _ = frame.execute_script(js, &script); }
        }
    }
}

/// Queue a navigation through the ordinary Page.navigate security/interception pipeline.
/// @param ctx Owning browser. @param page_id Target page. @param request Engine command.
/// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn queue_navigation(ctx: &mut CdpContext, page_id: &str, request: &Value) {
    let Some(url) = request.get("url").and_then(Value::as_str) else { return; };
    let Ok(destination) = url::Url::parse(url) else { return; };
    if !matches!(destination.scheme(), "http" | "https") && url != "about:blank" { return; }
    let session = ctx.sessions.iter().find(|(_, owner)| owner.as_str() == page_id).map(|(session, _)| session.clone());
    let Some(session) = session else { return; };
    let mut params = json!({"url":url, "__method":request["method"].as_str().unwrap_or("GET"), "__body":request["body"].as_str().unwrap_or("")});
    if request["noreferrer"] != true {
        if let Some(source) = request["sourceUrl"].as_str().and_then(|value| url::Url::parse(value).ok()) {
            let referer = if source.origin() == destination.origin() { source.to_string() } else { format!("{}/", source.origin().ascii_serialization()) };
            if matches!(source.scheme(), "http" | "https") { params["referrer"] = json!(referer); }
        }
    }
    ctx.auxiliary_windows.navigations.push_back((session, params));
}

/// Handle window commands inside Rust, never forwarding form bodies to CDP bindings or console.
/// @param ctx Browser context. @param source_id Command's real source page. @param payload Serialized command.
/// @return No value; malformed or retired targets are ignored. @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub(crate) fn handle(ctx: &mut CdpContext, source_id: &str, payload: &str) {
    let Ok(request) = serde_json::from_str::<Value>(payload) else { return; };
    let Some(id) = request["id"].as_str() else { return; };
    let Some(source) = ctx.get_page(source_id) else { return; };
    let context_id = source.context.id.clone();
    let source_viewport = source.viewport;
    let source_scale = source.device_scale_factor;
    let source_identity = source.browser_identity_configuration().map(str::to_owned);
    let operation = request["operation"].as_str().unwrap_or("");
    let key = (source_id.to_string(), id.to_string());
    if operation == "open" {
        let Some(url) = request["url"].as_str() else { return; };
        if !(url.starts_with("http://") || url.starts_with("https://") || url == "about:blank") { return; }
        let name = request["name"].as_str().unwrap_or("");
        let named_key = (context_id.clone(), name.to_string());
        let existing = ctx.auxiliary_windows.references.get(&key).or_else(|| if name.is_empty() { None } else { ctx.auxiliary_windows.names.get(&named_key) }).cloned();
        let target_id = if let Some(target) = existing.filter(|target| ctx.get_page(target).is_some()) { target } else {
            let Ok(target) = ctx.create_page_in_context(Some(&context_id)) else { return; };
            if let Some(page) = ctx.get_page_mut(&target) {
                if let Some(identity) = &source_identity { let _ = page.set_browser_identity(identity); }
                page.set_viewport(source_viewport);
                page.set_device_scale_factor(source_scale);
            }
            let session = format!("{target}-session");
            ctx.sessions.insert(session.clone(), target.clone());
            let noopener = request["noopener"] == true;
            ctx.auxiliary_windows.identities.insert(target.clone(), id.to_string());
            if !noopener { ctx.auxiliary_windows.openers.insert(target.clone(), (source_id.to_string(), id.to_string())); }
            if !name.is_empty() { ctx.auxiliary_windows.names.insert(named_key, target.clone()); }
            // Only native opener state belongs to this page. Context preload
            // scripts are installed by the auto-attached client before resume;
            // copying the opener's page-specific scripts changes their scope.
            let scripts = vec![format!("if(window===top)dispatchEvent(new CustomEvent('__obscura_auxiliary_control',{{detail:{}}}))", json!({"operation":"opener","id":id,"url":request["sourceUrl"],"name":name,"noopener":noopener}))];
            for script in scripts {
                ctx.preload_counter += 1;
                let script_id = ctx.preload_counter.to_string();
                ctx.preload_script_pages.insert(script_id.clone(), target.clone());
                ctx.preload_scripts.push((script_id, script));
            }
            let scripts = ctx.preload_sources_for_page(&target);
            if let Some(page) = ctx.get_page_mut(&target) { page.set_preload_scripts(scripts); }
            let mut info = json!({"targetId":target,"type":"page","title":"","url":"about:blank","attached":true,"canAccessOpener":!noopener,"browserContextId":context_id});
            if !noopener { info["openerId"] = json!(source_id); }
            ctx.pending_events.push(CdpEvent::new("Page.windowOpen", json!({"url":url,"windowName":name,"windowFeatures":[],"userGesture":false})));
            ctx.pending_events.push(CdpEvent::new("Target.targetCreated", json!({"targetInfo":info})));
            let waiting = ctx.auxiliary_windows.auto_attach;
            if waiting { ctx.auxiliary_windows.waiting.insert(target.clone()); }
            ctx.pending_events.push(CdpEvent::new("Target.attachedToTarget", json!({"sessionId":session,"targetInfo":info,"waitingForDebugger":waiting})));
            target
        };
        ctx.auxiliary_windows.references.insert(key, target_id.clone());
        queue_navigation(ctx, &target_id, &request);
        return;
    }
    let opener = request["opener"] == true;
    let target = if opener { ctx.auxiliary_windows.openers.get(source_id).filter(|(_, reference)| reference == id).map(|(parent, _)| parent.clone()) }
        else { ctx.auxiliary_windows.references.get(&key).cloned().or_else(|| ctx.auxiliary_windows.identities.get(source_id).filter(|reference| reference.as_str() == id).map(|_| source_id.to_string())) };
    let Some(target) = target.filter(|target| ctx.get_page(target).is_some()) else { return; };
    match operation {
        "navigate" => queue_navigation(ctx, &target, &request),
        "close" => crate::domains::target::close_target(ctx, &target),
        "message" => {
            let origin = request["sourceUrl"].as_str().and_then(|value| url::Url::parse(value).ok()).map(|url| url.origin().ascii_serialization()).unwrap_or_default();
            let target_origin = if request["targetOrigin"] == "/" { json!(origin) } else { request["targetOrigin"].clone() };
            let reference = if opener { ctx.auxiliary_windows.references.iter().find(|((owner, _), child)| owner == &target && child.as_str() == source_id).map(|((_, id), _)| id.clone()) }
                else { ctx.auxiliary_windows.openers.get(&target).map(|(_, id)| id.clone()) };
            notify(ctx, &target, json!({"operation":"message","id":reference.unwrap_or_else(||id.to_string()),"data":request["data"],"origin":origin,"targetOrigin":target_origin,"fromOpener":!opener}));
        }
        _ => {}
    }
}

/// Take a queued navigation only after the CDP client configured the new target.
/// @param ctx Browser context. @return Session and native Page.navigate parameters, if ready.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub(crate) fn take_navigation(ctx: &mut CdpContext) -> Option<(String, Value)> {
    let index = ctx.auxiliary_windows.navigations.iter().position(|(session, _)| ctx.sessions.get(session).is_some_and(|page| !ctx.auxiliary_windows.waiting.contains(page)))?;
    ctx.auxiliary_windows.navigations.remove(index)
}

/// Update live window references after a document commits, including redirects.
/// @param ctx Browser context. @param target Target page. @param url Committed document URL.
/// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub(crate) fn committed(ctx: &mut CdpContext, target: &str, url: &str) {
    let references: Vec<_> = ctx.auxiliary_windows.references.iter().filter(|(_, child)| child.as_str() == target).map(|((page, id), _)| (page.clone(), id.clone())).collect();
    for (page, id) in references { notify(ctx, &page, json!({"id":id,"url":url})); }
    ctx.auxiliary_windows.references.retain(|(owner, _), _| owner != target);
}

/// Release window names and notify both child references and opener references on close.
/// @param ctx Browser context. @param target Closed page. @return No value.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub(crate) fn closed(ctx: &mut CdpContext, target: &str) {
    let references: Vec<_> = ctx.auxiliary_windows.references.iter().filter(|(_, child)| child.as_str() == target).map(|((page, id), _)| (page.clone(), id.clone())).collect();
    for (page, id) in references { notify(ctx, &page, json!({"id":id,"closed":true})); }
    let children: Vec<_> = ctx.auxiliary_windows.openers.iter().filter(|(_, (parent, _))| parent == target).map(|(child, (_, id))| (child.clone(), id.clone())).collect();
    for (child, id) in children { notify(ctx, &child, json!({"id":id,"closed":true})); }
    let sessions: HashSet<_> = ctx.sessions.iter().filter(|(_, page)| page.as_str() == target).map(|(session, _)| session.clone()).collect();
    ctx.auxiliary_windows.navigations.retain(|(session, _)| !sessions.contains(session));
    ctx.auxiliary_windows.waiting.remove(target);
    ctx.auxiliary_windows.references.retain(|(owner, _), child| owner != target && child != target);
    ctx.auxiliary_windows.names.retain(|_, child| child != target);
    ctx.auxiliary_windows.openers.remove(target);
    ctx.auxiliary_windows.identities.remove(target);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verify named targets are owned and reused by the native browser context.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[tokio::test]
    async fn named_windows_reuse_targets_and_preserve_post_parameters() {
        let mut ctx = CdpContext::new();
        let parent = ctx.create_page();
        ctx.get_page_mut(&parent).unwrap().set_viewport((412.0, 787.0));
        for id in ["first", "second"] {
            handle(&mut ctx, &parent, &json!({"operation":"open","id":id,"name":"offer","url":"https://fixture.invalid/result","sourceUrl":"https://fixture.invalid/form","method":"POST","body":"answer=fixture"}).to_string());
        }
        assert_eq!(ctx.pages.len(), 2);
        assert_eq!(ctx.pages[1].viewport, (412.0, 787.0));
        let (_, params) = take_navigation(&mut ctx).unwrap();
        assert_eq!(params["__method"], "POST");
        assert_eq!(params["__body"], "answer=fixture");
        assert_eq!(params["referrer"], "https://fixture.invalid/form");
        assert!(take_navigation(&mut ctx).is_some());
    }

    /// Verify new targets cannot navigate before the auto-attached client is ready.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[tokio::test]
    async fn auto_attached_window_waits_for_configuration_and_close_releases_name() {
        let mut ctx = CdpContext::new();
        let parent = ctx.create_page();
        ctx.auxiliary_windows.auto_attach = true;
        let request = json!({"operation":"open","id":"one","name":"offer","url":"https://fixture.invalid/","sourceUrl":"https://fixture.invalid/","method":"GET"}).to_string();
        handle(&mut ctx, &parent, &request);
        assert!(take_navigation(&mut ctx).is_none());
        let child = ctx.pages[1].id.clone();
        ctx.auxiliary_windows.waiting.remove(&child);
        assert!(take_navigation(&mut ctx).is_some());
        ctx.remove_page(&child);
        handle(&mut ctx, &parent, &request);
        assert_ne!(ctx.pages[1].id, child);
    }

    /// Verify page-scoped client scripts are not copied to auxiliary windows.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[tokio::test]
    async fn popup_keeps_page_scoped_scripts_separate_and_noopener_can_close_itself() {
        let mut ctx = CdpContext::new();
        let parent = ctx.create_page();
        ctx.preload_scripts.push(("fixture".into(), "globalThis.parentOnly = true".into()));
        ctx.preload_script_pages.insert("fixture".into(), parent.clone());
        handle(&mut ctx, &parent, &json!({"operation":"open","id":"child","url":"about:blank","noopener":true}).to_string());
        let child = ctx.pages[1].id.clone();
        assert!(!ctx.preload_sources_for_page(&child).iter().any(|script| script.contains("parentOnly")));
        handle(&mut ctx, &child, &json!({"operation":"close","id":"child"}).to_string());
        assert_eq!(ctx.pages.len(), 1);
    }

    /// Verify target names never cross isolated browser contexts.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[tokio::test]
    async fn named_targets_are_isolated_by_browser_context() {
        let mut ctx = CdpContext::new();
        let first = ctx.create_page();
        let isolated = ctx.create_browser_context();
        let second = ctx.create_page_in_context(Some(&isolated)).unwrap();
        let request = json!({"operation":"open","id":"one","name":"offer","url":"https://fixture.invalid/","method":"GET"}).to_string();
        handle(&mut ctx, &first, &request);
        handle(&mut ctx, &second, &request);
        assert_eq!(ctx.pages.len(), 4);
        assert_ne!(ctx.auxiliary_windows.references[&(first,"one".into())], ctx.auxiliary_windows.references[&(second,"one".into())]);
    }
}
