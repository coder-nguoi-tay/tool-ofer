//! Engine-Level Direct Hook for Obscura (In-Process Rust Engine)
//!
//! Provides direct bindings to hook into Obscura's Rust Page & Context lifecycle,
//! avoiding WebSocket/CDP serialization overhead.

use crate::profile::AntiDetectProfile;
use crate::stealth_script::generate_stealth_js;

/// Quản lý cấu hình Anti-Detect tích hợp ở tầng Rust Context của Obscura.
pub struct ObscuraEngineHook;

impl ObscuraEngineHook {
    /// Chuẩn bị script injection để truyền vào `obscura::Page::add_preload_script`.
    ///
    /// Khi Obscura nạp trang qua `page.goto(url).await`, V8 sẽ tự động thực thi
    /// preload script này trước khi bất kỳ file JS nào của trang web tải về.
    pub fn get_page_preload_script(profile: &AntiDetectProfile) -> String {
        generate_stealth_js(profile)
    }

    /// Trích xuất danh sách HTTP headers phù hợp với profile để thiết lập cho Request Client của Obscura:
    /// - `User-Agent`
    /// - `Accept-Language`
    /// - `sec-ch-ua`
    /// - `sec-ch-ua-mobile`
    /// - `sec-ch-ua-platform`
    pub fn get_browser_request_headers(profile: &AntiDetectProfile) -> Vec<(String, String)> {
        let mut headers = vec![
            ("User-Agent".to_string(), profile.user_agent.clone()),
            ("Accept-Language".to_string(), profile.languages.join(",") + ";q=0.9"),
        ];

        if let Some(ref ch) = profile.client_hints {
            let brands_header = ch
                .brands
                .iter()
                .map(|b| format!("\"{}\";v=\"{}\"", b.brand, b.version))
                .collect::<Vec<_>>()
                .join(", ");

            let mobile_header = if ch.mobile { "?1" } else { "?0" };
            let platform_header = format!("\"{}\"", ch.platform);

            headers.push(("sec-ch-ua".to_string(), brands_header));
            headers.push(("sec-ch-ua-mobile".to_string(), mobile_header.to_string()));
            headers.push(("sec-ch-ua-platform".to_string(), platform_header));
        }

        headers
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{generate_profile, TargetOs};

    #[test]
    fn test_engine_request_headers() {
        let profile = generate_profile(555, TargetOs::MacOS);
        let headers = ObscuraEngineHook::get_browser_request_headers(&profile);

        let map: std::collections::HashMap<_, _> = headers.into_iter().collect();
        assert!(map.contains_key("User-Agent"));
        assert!(map.contains_key("sec-ch-ua"));
        assert_eq!(map.get("sec-ch-ua-platform").unwrap(), "\"macOS\"");
    }
}
