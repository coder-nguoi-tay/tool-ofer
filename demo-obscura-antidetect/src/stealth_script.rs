//! Legacy API compatibility. Browser capabilities are configured in the native engine.
use crate::profile::AntiDetectProfile;

/// Giữ tương thích API cũ, không sinh JavaScript vá API trình duyệt.
/// @param profile Danh tính được cấu hình qua native identity trước điều hướng.
/// @return Chuỗi rỗng.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub fn generate_stealth_js(_profile: &AntiDetectProfile) -> String { String::new() }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generator::{generate_profile, TargetOs};
    /// Không phát lại script vá khi caller cũ gọi API tương thích.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn legacy_script_api_never_emits_browser_patches() {
        assert!(generate_stealth_js(&generate_profile(42, TargetOs::Windows)).is_empty());
    }
}
