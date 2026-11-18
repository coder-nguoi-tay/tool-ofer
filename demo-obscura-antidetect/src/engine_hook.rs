//! Engine-Level Direct Hook for Obscura (In-Process Rust Engine)
//!
//! Provides direct bindings to hook into Obscura's Rust Page & Context lifecycle,
//! avoiding WebSocket/CDP serialization overhead.

use crate::profile::AntiDetectProfile;

/// Quản lý cấu hình Anti-Detect tích hợp ở tầng Rust Context của Obscura.
pub struct ObscuraEngineHook;

impl ObscuraEngineHook {
    /// Cấu hình trực tiếp native identity trước khi trang được điều hướng.
    /// @param page Trang Obscura. @param profile Danh tính thiết bị.
    /// @return Kết quả cấu hình. @throws anyhow::Error Khi cấu hình không hợp lệ.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn apply_browser_identity(page: &mut obscura::Page, profile: &AntiDetectProfile) -> anyhow::Result<()> {
        page.set_browser_identity(&serde_json::to_string(profile)?)?;
        Ok(())
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
