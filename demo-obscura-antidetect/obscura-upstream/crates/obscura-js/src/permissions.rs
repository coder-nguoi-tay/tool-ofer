//! Chính sách quyền thuộc BrowserContext, không thuộc object JavaScript của trang.
use std::collections::HashMap;
use std::sync::{RwLock, atomic::{AtomicU64, Ordering}};

pub const PERMISSION_NAMES: &[&str] = &[
    "geolocation", "notifications", "camera", "microphone", "midi", "clipboard-read",
    "clipboard-write", "persistent-storage", "background-sync", "accelerometer",
    "gyroscope", "magnetometer", "screen-wake-lock", "payment-handler",
];

/// Lưu override quyền theo origin và BrowserContext, độc lập với object JavaScript.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
#[derive(Default)]
pub struct PermissionPolicy {
    /// @var RwLock<HashMap<Option<String>, HashMap<String, String>>> Policy từng origin; None là wildcard.
    origins: RwLock<HashMap<Option<String>, HashMap<String, String>>>,
    /// @var AtomicU64 Generation dùng đánh thức binding khi policy thay đổi.
    revision: AtomicU64,
}

impl PermissionPolicy {
    /// Đọc quyền của origin; origin opaque không được dùng quyền mạnh.
    /// @param self Policy của context đang gọi.
    /// @param origin Origin của realm.
    /// @param name Tên quyền Web API.
    /// @return Option<String> Trạng thái hoặc None nếu API chưa hỗ trợ tên quyền.
    /// @throws never Khôi phục lock bị poison thay vì ném lỗi.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn query(&self, origin: &str, name: &str) -> Option<String> {
        if !PERMISSION_NAMES.contains(&name) { return None; }
        if origin == "null" { return Some("denied".into()); }
        let origins = self.origins.read().unwrap_or_else(|error| error.into_inner());
        Some(origins.get(&Some(origin.into())).and_then(|policy| policy.get(name))
            .or_else(|| origins.get(&None).and_then(|policy| policy.get(name)))
            .cloned().unwrap_or_else(|| "prompt".into()))
    }

    /// Cấp danh sách quyền và từ chối các quyền còn lại trong cùng phạm vi CDP.
    /// @param self Policy của context cần cập nhật.
    /// @param origin Origin cụ thể hoặc mọi origin.
    /// @param names Các tên đã chuẩn hóa.
    /// @return Result<(), String> Thành công hoặc lỗi, không ghi policy một phần.
    /// @throws String Trả Err nếu tên hoặc quota không hợp lệ.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn grant(&self, origin: Option<String>, names: &[String]) -> Result<(), String> {
        if names.iter().any(|name| !PERMISSION_NAMES.contains(&name.as_str())) {
            return Err("Unsupported permission".into());
        }
        let policy = PERMISSION_NAMES.iter().map(|name| (name.to_string(),
            if names.iter().any(|granted| granted.as_str() == *name) { "granted" } else { "denied" }.into())).collect();
        let mut origins = self.origins.write().unwrap_or_else(|error| error.into_inner());
        if origins.len() >= 1024 && !origins.contains_key(&origin) { return Err("Permission origin limit exceeded".into()); }
        origins.insert(origin, policy);
        self.revision.fetch_add(1, Ordering::Release);
        Ok(())
    }

    /// Cập nhật một quyền, không ghi đè quyền khác của origin.
    /// @param self Policy của context cần cập nhật.
    /// @param origin Phạm vi origin.
    /// @param name Tên quyền.
    /// @param setting Trạng thái granted, denied hoặc prompt.
    /// @return Result<(), String> Thành công hoặc lỗi, không ghi policy một phần.
    /// @throws String Trả Err khi tham số hoặc quota không hợp lệ.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn set(&self, origin: Option<String>, name: &str, setting: &str) -> Result<(), String> {
        if !PERMISSION_NAMES.contains(&name) || !["granted", "denied", "prompt"].contains(&setting) {
            return Err("Unsupported permission or setting".into());
        }
        let mut origins = self.origins.write().unwrap_or_else(|error| error.into_inner());
        if origins.len() >= 1024 && !origins.contains_key(&origin) { return Err("Permission origin limit exceeded".into()); }
        origins.entry(origin).or_default().insert(name.into(), setting.into());
        self.revision.fetch_add(1, Ordering::Release);
        Ok(())
    }

    /// Xóa toàn bộ override của context; không thay đổi context khác.
    /// @param self Policy của context cần reset.
    /// @return () Không có giá trị.
    /// @throws never Khôi phục lock bị poison thay vì ném lỗi.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn reset(&self) {
        self.origins.write().unwrap_or_else(|error| error.into_inner()).clear();
        self.revision.fetch_add(1, Ordering::Release);
    }

    /// Đọc generation để runtime chỉ thông báo khi policy thay đổi.
    /// @param self Policy của context đang gọi.
    /// @return u64 Generation hiện tại.
    /// @throws never Chỉ đọc atomic, không có đường trả lỗi.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn revision(&self) -> u64 { self.revision.load(Ordering::Acquire) }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Kiểm tra phạm vi, wildcard, reset và lỗi không được sửa một phần policy.
    /// @param none Không có tham số.
    /// @return () Hoàn tất kiểm tra assertion.
    /// @throws panic Nếu policy vi phạm phạm vi hoặc cập nhật không nguyên tử.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn grants_are_atomic_and_scoped_to_origin_and_context() {
        let policy = PermissionPolicy::default();
        policy.set(None, "notifications", "granted").unwrap();
        policy.grant(Some("https://a.test".into()), &["geolocation".into()]).unwrap();
        assert_eq!(policy.query("https://a.test", "geolocation").as_deref(), Some("granted"));
        assert_eq!(policy.query("https://a.test", "notifications").as_deref(), Some("denied"));
        assert_eq!(policy.query("https://b.test", "notifications").as_deref(), Some("granted"));
        let revision = policy.revision();
        assert!(policy.grant(Some("https://a.test".into()), &["unknown".into()]).is_err());
        assert_eq!(policy.revision(), revision);
        assert_eq!(PermissionPolicy::default().query("https://a.test", "geolocation").as_deref(), Some("prompt"));
        assert_eq!(policy.query("null", "notifications").as_deref(), Some("denied"));
        policy.reset();
        assert_eq!(policy.query("https://a.test", "geolocation").as_deref(), Some("prompt"));
    }

    /// Override từng quyền phải giữ fallback wildcard cho các quyền chưa ghi đè.
    /// @param none Không có tham số.
    /// @return () Hoàn tất kiểm tra ưu tiên origin theo từng quyền.
    /// @throws panic Nếu origin ghi đè nhầm quyền khác hoặc context khác.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn origin_overrides_inherit_wildcard_per_permission() {
        let policy = PermissionPolicy::default();
        let other_context = PermissionPolicy::default();
        policy.set(None, "geolocation", "granted").unwrap();
        policy.set(None, "notifications", "denied").unwrap();
        policy.set(Some("https://a.test".into()), "notifications", "granted").unwrap();
        assert_eq!(policy.query("https://a.test", "geolocation").as_deref(), Some("granted"));
        assert_eq!(policy.query("https://a.test", "notifications").as_deref(), Some("granted"));
        assert_eq!(policy.query("https://b.test", "notifications").as_deref(), Some("denied"));
        assert_eq!(other_context.query("https://a.test", "geolocation").as_deref(), Some("prompt"));
        assert_eq!(policy.query("null", "geolocation").as_deref(), Some("denied"));
        assert_eq!(policy.query("https://a.test", "unknown"), None);
    }

    /// Quota không làm ghi dở policy hoặc cấm cập nhật các origin đã có.
    /// @param none Không có tham số.
    /// @return () Hoàn tất kiểm tra quota, tính nguyên tử và reset.
    /// @throws panic Nếu thao tác quá quota làm đổi state hoặc generation.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn origin_limit_is_atomic_and_reset_releases_capacity() {
        let policy = PermissionPolicy::default();
        for index in 0..1024 {
            policy.set(Some(format!("https://origin-{index}.test")), "geolocation", "denied").unwrap();
        }
        let revision = policy.revision();
        let extra_origin = Some("https://overflow.test".to_string());
        assert!(policy.set(extra_origin.clone(), "geolocation", "granted").is_err());
        assert!(policy.grant(extra_origin, &["geolocation".into()]).is_err());
        assert!(policy.set(None, "geolocation", "granted").is_err());
        assert_eq!(policy.revision(), revision);
        assert_eq!(policy.query("https://overflow.test", "geolocation").as_deref(), Some("prompt"));
        let existing = Some("https://origin-0.test".into());
        policy.set(existing.clone(), "notifications", "granted").unwrap();
        policy.grant(existing, &["geolocation".into()]).unwrap();
        assert_eq!(policy.query("https://origin-0.test", "geolocation").as_deref(), Some("granted"));
        assert_eq!(policy.query("https://origin-0.test", "notifications").as_deref(), Some("denied"));
        let revision = policy.revision();
        assert!(policy.set(Some("https://origin-0.test".into()), "geolocation", "invalid").is_err());
        assert_eq!(policy.revision(), revision);
        policy.reset();
        policy.set(None, "geolocation", "granted").unwrap();
        assert_eq!(policy.query("https://overflow.test", "geolocation").as_deref(), Some("granted"));
    }
}
