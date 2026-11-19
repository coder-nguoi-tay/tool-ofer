use serde_json::{json, Value};
use crate::dispatch::CdpContext;

/// Chuẩn hóa tên quyền CDP sang các quyền Web API core hỗ trợ.
/// @param name Tên PermissionType của CDP.
/// @return Result<Vec<String>, String> Một hoặc nhiều tên Web API đã hỗ trợ.
/// @throws String Trả Err khi chưa hỗ trợ quyền.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn permission_names(name: &str) -> Result<Vec<String>, String> {
    let names: &[&str] = match name {
        "geolocation" => &["geolocation"], "notifications" => &["notifications"],
        "audioCapture" => &["microphone"], "videoCapture" => &["camera"], "midi" => &["midi"],
        "clipboardReadWrite" => &["clipboard-read", "clipboard-write"],
        "clipboardSanitizedWrite" => &["clipboard-write"], "durableStorage" => &["persistent-storage"],
        "backgroundSync" => &["background-sync"], "sensors" => &["accelerometer", "gyroscope", "magnetometer"],
        "wakeLockScreen" => &["screen-wake-lock"], "paymentHandler" => &["payment-handler"],
        _ => return Err(format!("Unsupported permission: {name}")),
    };
    Ok(names.iter().map(|name| name.to_string()).collect())
}

/// Chuẩn hóa phạm vi origin tại ranh giới CDP; không chấp nhận opaque origin.
/// @param params Tham số command.
/// @return Result<Option<String>, String> Origin chuẩn hoặc wildcard.
/// @throws String Trả Err khi URL không có origin hợp lệ.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn permission_origin(params: &Value) -> Result<Option<String>, String> {
    let Some(value) = params.get("origin") else { return Ok(None); };
    let source = value.as_str().ok_or("origin must be a string")?;
    let origin = url::Url::parse(source).map_err(|_| "Invalid permission origin")?.origin().ascii_serialization();
    if origin == "null" { return Err("Opaque permission origin is not supported".into()); }
    Ok(Some(origin))
}

/// Xử lý Browser command, giữ quyền theo đúng BrowserContext thay vì trả thành công rỗng.
/// @param method Command.
/// @param params Tham số CDP.
/// @param ctx Context kết nối.
/// @return Result<Value, String> Kết quả hoặc lỗi CDP.
/// @throws String Trả Err nếu tham số, context hoặc quyền chưa hỗ trợ.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
pub async fn handle(method: &str, params: &Value, ctx: &mut CdpContext) -> Result<Value, String> {
    match method {
        "getVersion" => Ok(json!({
            "protocolVersion": "1.3",
            "product": "Chrome/145.0.0.0",
            "revision": "@0000000000000000000000000000000000000000",
            "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
            "jsVersion": "14.5.0.0",
        })),
        "close" => {
            Ok(json!({}))
        }
        "getWindowForTarget" => Ok(json!({
            "windowId": 1,
            "bounds": {
                "left": 0,
                "top": 0,
                "width": 1280,
                "height": 720,
                "windowState": "normal",
            }
        })),
        "setDownloadBehavior" => Ok(json!({})),
        "getWindowBounds" => Ok(json!({
            "bounds": { "left": 0, "top": 0, "width": 1280, "height": 720, "windowState": "normal" }
        })),
        // No-op acks for window-management methods Playwright sends during
        // page setup. We don't model real OS windows, but answering with {}
        // lets the client's setup sequence complete instead of tearing down
        // the page on an unknown-method error.
        "setWindowBounds" => Ok(json!({})),
        "grantPermissions" | "resetPermissions" | "setPermission" => {
            let context = match params.get("browserContextId") {
                None => ctx.default_context.clone(),
                Some(value) => ctx.browser_context(value.as_str().ok_or("browserContextId must be a string")?)
                    .cloned().ok_or("Unknown browser context")?,
            };
            match method {
                "resetPermissions" => context.permissions.reset(),
                "grantPermissions" => {
                    let origin = permission_origin(params)?;
                    let mut names = Vec::new();
                    for value in params["permissions"].as_array().ok_or("permissions must be an array")? {
                        names.extend(permission_names(value.as_str().ok_or("Permission must be a string")?)?);
                    }
                    context.permissions.grant(origin, &names)?;
                }
                _ => {
                    if params.get("embeddedOrigin").is_some() {
                        return Err("embeddedOrigin permission overrides are not supported".into());
                    }
                    let origin = permission_origin(params)?;
                    let descriptor = params["permission"].as_object().ok_or("permission must be a descriptor")?;
                    if descriptor.keys().any(|key| key != "name") {
                        return Err("Extended permission descriptors are not supported".into());
                    }
                    let name = descriptor.get("name").and_then(Value::as_str).ok_or("Permission name required")?;
                    let setting = params["setting"].as_str().ok_or("Permission setting required")?;
                    context.permissions.set(origin, name, setting)?;
                }
            }
            Ok(json!({}))
        }
        _ => Err(format!("Unknown Browser method: {}", method)),
    }
}
