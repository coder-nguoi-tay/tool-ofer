//! CDP Protocol Bridge for Obscura Anti-Detect
//!
//! Provides helper functions and payload builders to apply fingerprint spoofing
//! through Chrome DevTools Protocol (CDP) commands supported by Obscura (`obscura serve --port 9222`).

use crate::profile::AntiDetectProfile;
use serde_json::{json, Value};

pub struct CdpBridge;

impl CdpBridge {
    /// Cấu hình danh tính tại core Rust qua CDP trước điều hướng, không tiêm JavaScript.
    /// @param id CDP request ID. @param profile Danh tính thiết bị.
    /// @return Payload native. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn build_browser_identity_payload(id: u64, profile: &AntiDetectProfile) -> Value {
        json!({"id":id,"method":"Emulation.setBrowserIdentity","params":{"profile":profile}})
    }

    /// 2. Tạo payload CDP `Network.setUserAgentOverride`
    ///
    /// Đồng bộ User-Agent, ngôn ngữ, platform và Client Hints ở tầng Network request.
    pub fn build_user_agent_override_payload(id: u64, profile: &AntiDetectProfile) -> Value {
        let mut params = json!({
            "userAgent": profile.user_agent,
            "acceptLanguage": profile.languages.join(","),
            "platform": profile.platform,
        });

        if let Some(ref ch) = profile.client_hints {
            let brands: Vec<Value> = ch
                .brands
                .iter()
                .map(|b| {
                    json!({
                        "brand": b.brand,
                        "version": b.version
                    })
                })
                .collect();

            params["userAgentMetadata"] = json!({
                "brands": brands,
                "fullVersionList": brands.clone(),
                "fullVersion": profile.chrome_version,
                "platform": ch.platform,
                "platformVersion": ch.platform_version,
                "architecture": ch.architecture,
                "model": ch.model,
                "mobile": ch.mobile,
                "bitness": ch.bitness
            });
        }

        json!({
            "id": id,
            "method": "Network.setUserAgentOverride",
            "params": params
        })
    }

    /// 3. Tạo payload CDP `Emulation.setDeviceMetricsOverride`
    ///
    /// Thiết lập độ phân giải màn hình, tỷ lệ Device Pixel Ratio và mobile emulation.
    pub fn build_device_metrics_override_payload(id: u64, profile: &AntiDetectProfile) -> Value {
        json!({
            "id": id,
            "method": "Emulation.setDeviceMetricsOverride",
            "params": {
                "width": profile.screen.width,
                "height": profile.screen.height,
                "deviceScaleFactor": profile.screen.device_pixel_ratio,
                "mobile": profile.is_mobile,
                "screenWidth": profile.screen.width,
                "screenHeight": profile.screen.height
            }
        })
    }

    /// 4. Tạo bộ chuỗi lệnh CDP tuần tự (Batch Initialization Sequence)
    ///
    /// Trả về danh sách các bản tin JSON CDP cần gửi đến WebSocket session của tab Obscura.
    pub fn build_full_init_sequence(start_id: u64, profile: &AntiDetectProfile) -> Vec<Value> {
        vec![
            Self::build_browser_identity_payload(start_id, profile),
            Self::build_user_agent_override_payload(start_id + 1, profile),
            Self::build_device_metrics_override_payload(start_id + 2, profile),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{generate_profile, TargetOs};

    #[test]
    fn test_cdp_payload_generation() {
        let profile = generate_profile(888, TargetOs::Windows);
        let seq = CdpBridge::build_full_init_sequence(1, &profile);

        assert_eq!(seq.len(), 3);
        assert_eq!(seq[0]["method"], "Emulation.setBrowserIdentity");
        assert_eq!(seq[0]["params"]["profile"]["platform"], profile.platform);
        assert_eq!(seq[1]["method"], "Network.setUserAgentOverride");
        assert_eq!(seq[2]["method"], "Emulation.setDeviceMetricsOverride");

        // Kiểm tra User-Agent override
        assert_eq!(seq[1]["params"]["userAgent"], profile.user_agent);
        assert_eq!(seq[2]["params"]["width"], profile.screen.width);
    }
}
