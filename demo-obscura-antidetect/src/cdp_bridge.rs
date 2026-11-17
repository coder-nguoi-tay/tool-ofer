//! CDP Protocol Bridge for Obscura Anti-Detect
//!
//! Provides helper functions and payload builders to apply fingerprint spoofing
//! through Chrome DevTools Protocol (CDP) commands supported by Obscura (`obscura serve --port 9222`).

use crate::profile::AntiDetectProfile;
use crate::stealth_script::generate_stealth_js;
use serde_json::{json, Value};

pub struct CdpBridge;

impl CdpBridge {
    /// 1. Tạo payload CDP `Page.addScriptToEvaluateOnNewDocument`
    ///
    /// Lệnh này yêu cầu Obscura tiêm script stealth vào mọi target/page mới
    /// trước khi bất kỳ script HTML/JS nào của trang web bắt đầu thực thi.
    pub fn build_add_script_to_evaluate_payload(id: u64, profile: &AntiDetectProfile) -> Value {
        let script = generate_stealth_js(profile);
        json!({
            "id": id,
            "method": "Page.addScriptToEvaluateOnNewDocument",
            "params": {
                "source": script,
                "worldName": "" // default main execution context
            }
        })
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
            Self::build_add_script_to_evaluate_payload(start_id, profile),
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
        assert_eq!(seq[0]["method"], "Page.addScriptToEvaluateOnNewDocument");
        assert_eq!(seq[1]["method"], "Network.setUserAgentOverride");
        assert_eq!(seq[2]["method"], "Emulation.setDeviceMetricsOverride");

        // Kiểm tra User-Agent override
        assert_eq!(seq[1]["params"]["userAgent"], profile.user_agent);
        assert_eq!(seq[2]["params"]["width"], profile.screen.width);
    }
}
