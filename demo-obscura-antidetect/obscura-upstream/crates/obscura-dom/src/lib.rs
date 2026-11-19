#[macro_use]
extern crate html5ever;

pub mod tree;
pub mod tree_sink;
pub mod selector;
pub mod serialize;

pub use tree::{
    AttachShadowError, Attribute, DomTree, Node, NodeData, NodeId, ShadowRoot,
    ShadowRootMode,
};
pub use tree_sink::{parse_fragment, parse_fragment_with_context, parse_html, parse_srcdoc};

/// Builds a navigation document and its public MIME type for a page or a child frame.
/// @param body Decoded response body. @param content_type Optional Content-Type header.
/// @return Parsed tree and lowercased MIME essence, empty when no header was supplied.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-19
pub fn parse_response_document(body: &str, content_type: Option<&str>) -> (DomTree, String) {
    let mime = content_type.unwrap_or_default().split(';').next().unwrap_or_default().trim().to_ascii_lowercase();
    let dom = if matches!(mime.as_str(), "text/plain" | "text/markdown" | "text/x-markdown") {
        if body.is_empty() {
            parse_html("<!DOCTYPE html>")
        } else {
            // The parser drops the synthetic newline and normalizes CRLF like Chromium.
            let mut html = String::with_capacity(body.len() + 100);
            html.push_str("<!DOCTYPE html><html><head><meta charset=utf-8><title></title></head><body><pre>\n");
            for character in body.chars() {
                match character {
                    '&' => html.push_str("&amp;"),
                    '<' => html.push_str("&lt;"),
                    '>' => html.push_str("&gt;"),
                    _ => html.push(character),
                }
            }
            html.push_str("</pre></body></html>");
            parse_html(&html)
        }
    } else {
        parse_html(body)
    };
    (dom, mime)
}
