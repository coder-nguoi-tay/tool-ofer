use serde_json::{json, Value};

use crate::dispatch::CdpContext;

const MAX_DEVICE_METRIC_DIMENSION: i64 = 10_000_000;

fn metric_dimension(params: &Value, name: &str) -> Result<u32, String> {
    let value = params
        .get(name)
        .and_then(Value::as_i64)
        .ok_or_else(|| format!("Emulation.setDeviceMetricsOverride requires integer {name}"))?;
    if !(0..=MAX_DEVICE_METRIC_DIMENSION).contains(&value) {
        return Err(format!(
            "Emulation.setDeviceMetricsOverride {name} must be between 0 and {MAX_DEVICE_METRIC_DIMENSION}"
        ));
    }
    Ok(value as u32)
}

fn optional_metric_dimension(params: &Value, name: &str) -> Result<Option<u32>, String> {
    params
        .get(name)
        .map(|_| metric_dimension(params, name))
        .transpose()
}

fn default_background_color(params: &Value) -> Result<Option<[u8; 4]>, String> {
    let Some(color) = params.get("color") else {
        return Ok(None);
    };
    let color = color.as_object().ok_or(
        "Emulation.setDefaultBackgroundColorOverride color must be an RGBA object",
    )?;
    let channel = |name: &str| -> Result<u8, String> {
        let value = color.get(name).and_then(Value::as_i64).ok_or_else(|| {
            format!(
                "Emulation.setDefaultBackgroundColorOverride requires integer color.{name}"
            )
        })?;
        Ok(value.clamp(0, 255) as u8)
    };
    let alpha = match color.get("a") {
        Some(value) => value.as_f64().ok_or(
            "Emulation.setDefaultBackgroundColorOverride color.a must be a number",
        )?,
        None => 1.0,
    };
    if !alpha.is_finite() {
        return Err(
            "Emulation.setDefaultBackgroundColorOverride color.a must be finite".to_string(),
        );
    }
    Ok(Some([
        channel("r")?,
        channel("g")?,
        channel("b")?,
        ((alpha as f32).clamp(0.0, 1.0) * 255.0).round() as u8,
    ]))
}

/// Validate geolocation arguments before mutating a page, including incomplete supplied readings.
/// @param params CDP object whose optional latitude, longitude and accuracy fields are numbers.
/// @return A complete reading, or None to emulate position unavailable when any required field is omitted.
/// @throws String Returned for invalid types/ranges or unsupported altitude, altitudeAccuracy, heading or speed.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn geolocation_override(params: &Value) -> Result<Option<(f64, f64, f64)>, String> {
    let params = params.as_object().ok_or("Emulation.setGeolocationOverride params must be an object")?;
    for name in ["altitude", "altitudeAccuracy", "heading", "speed"] {
        if params.contains_key(name) {
            return Err(format!("Emulation.setGeolocationOverride {name} is not supported"));
        }
    }
    let mut position = [None; 3];
    for (index, (name, minimum, maximum)) in [("latitude", -90.0, 90.0),
        ("longitude", -180.0, 180.0), ("accuracy", 0.0, f64::MAX)].into_iter().enumerate() {
        if let Some(value) = params.get(name) {
            let value = value.as_f64().filter(|value| value.is_finite())
                .ok_or_else(|| format!("Emulation.setGeolocationOverride {name} must be a finite number"))?;
            if !(minimum..=maximum).contains(&value) {
                return Err(format!("Emulation.setGeolocationOverride {name} is out of range"));
            }
            position[index] = Some(value);
        }
    }
    Ok(match position {
        [Some(latitude), Some(longitude), Some(accuracy)] => Some((latitude, longitude, accuracy)),
        _ => None,
    })
}

/// Dispatch page-scoped CDP commands through native browser configuration.
/// @param method Domain method.
/// @param params Protocol arguments.
/// @param ctx Server context owning page and browser-context state.
/// @param session_id Optional attached page session.
/// @return Ok with the CDP response, or Err without applying invalid geolocation arguments.
/// @throws String Returned for invalid/unsupported arguments or unavailable page state; no error is thrown.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-18
pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "setBrowserIdentity" => {
            let profile = params.get("profile").ok_or("Emulation.setBrowserIdentity requires profile")?;
            let page = ctx.get_session_page_mut(session_id).ok_or("No page for session")?;
            page.set_browser_identity(&profile.to_string()).map_err(|error| error.to_string())?;
            page.apply_browser_request_identity().await;
            Ok(json!({}))
        }

        "setGeolocationOverride" => {
            let position = geolocation_override(params)?;
            let page = ctx.get_session_page_mut(session_id).ok_or("No page for session")?;
            page.set_geolocation_override(position)?;
            Ok(json!({}))
        }

        "clearGeolocationOverride" => {
            let page = ctx.get_session_page_mut(session_id).ok_or("No page for session")?;
            page.clear_geolocation_override();
            Ok(json!({}))
        }

        "setEmulatedMedia" => {
            let features = match params.get("features") {
                Some(features) => features.as_array().ok_or("Emulation.setEmulatedMedia features must be an array")?.as_slice(),
                None => &[],
            };
            let mut reduce = false;
            let mut dark = false;
            for feature in features {
                let name = feature.get("name").and_then(Value::as_str)
                    .ok_or("Media feature requires a string name")?;
                let value = feature.get("value").and_then(Value::as_str)
                    .ok_or("Media feature requires a string value")?;
                match name {
                    "prefers-reduced-motion" => {
                        if !matches!(value, "" | "reduce" | "no-preference") {
                            return Err("Invalid prefers-reduced-motion value".into());
                        }
                        reduce = value == "reduce";
                    }
                    "prefers-color-scheme" => {
                        if !matches!(value, "" | "dark" | "light" | "no-preference") {
                            return Err("Invalid prefers-color-scheme value".into());
                        }
                        dark = value == "dark";
                    }
                    _ => {}
                }
            }
            ctx.get_session_page_mut(session_id).ok_or("No page for session")?
                .set_media_preferences(reduce, dark);
            Ok(json!({}))
        }
        "setDeviceMetricsOverride" => {
            let width = metric_dimension(params, "width")?;
            let height = metric_dimension(params, "height")?;
            let device_scale_factor = params
                .get("deviceScaleFactor")
                .and_then(Value::as_f64)
                .ok_or("Emulation.setDeviceMetricsOverride requires deviceScaleFactor")?;
            if !device_scale_factor.is_finite() || device_scale_factor < 0.0 {
                return Err(
                    "Emulation.setDeviceMetricsOverride requires a non-negative finite deviceScaleFactor"
                        .to_string(),
                );
            }
            let mobile = params
                .get("mobile")
                .and_then(Value::as_bool)
                .ok_or("Emulation.setDeviceMetricsOverride requires boolean mobile")?;
            // Parse optional dimensions independently. Even an incomplete
            // screen-size pair must reject a malformed or out-of-range member.
            let screen_width = optional_metric_dimension(params, "screenWidth")?;
            let screen_height = optional_metric_dimension(params, "screenHeight")?;
            let screen_size = match (screen_width, screen_height) {
                (Some(screen_width), Some(screen_height))
                    if screen_width > 0 && screen_height > 0 =>
                {
                    Some((screen_width as f32, screen_height as f32))
                }
                _ => None,
            };
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            page.apply_device_metrics_override(
                (width > 0).then_some(width as f32),
                (height > 0).then_some(height as f32),
                (device_scale_factor > 0.0).then_some(device_scale_factor as f32),
                screen_size,
                mobile,
            );
            Ok(json!({}))
        }
        "clearDeviceMetricsOverride" => {
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            page.clear_device_metrics_override();
            Ok(json!({}))
        }
        "setDefaultBackgroundColorOverride" => {
            let color = default_background_color(params)?;
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            page.set_default_background_color_override(color);
            Ok(json!({}))
        }
        "setUserAgentOverride" => {
            let user_agent = params
                .get("userAgent")
                .and_then(Value::as_str)
                .ok_or("Emulation.setUserAgentOverride requires userAgent")?;
            let accept_language = params.get("acceptLanguage").and_then(Value::as_str);
            let page = ctx.get_session_page_mut(session_id).ok_or("No page for session")?;
            page.apply_browser_request_identity().await;
            let user_agent = if user_agent.is_empty() { page.http_client.user_agent.read().await.clone() } else { user_agent.to_owned() };
            page.set_request_user_agent(&user_agent, accept_language).await;
            Ok(json!({}))
        }
        "setLocaleOverride" => {
            let locale = params
                .get("locale")
                .and_then(Value::as_str)
                .ok_or("Emulation.setLocaleOverride requires locale")?;
            let page = ctx
                .get_session_page_mut(session_id)
                .ok_or("No page for session")?;
            page.set_locale_override((!locale.is_empty()).then(|| locale.to_string()));
            Ok(json!({}))
        }
        // Touch emulation does not affect layout yet, but acknowledging it is
        // compatible with clients that pair it with a metrics override.
        "setTouchEmulationEnabled" => Ok(json!({})),
        _ => Ok(json!({})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Protocol omissions mean unavailable, but every supplied field must still validate.
    /// @param None; this test takes no arguments.
    /// @return No value; assertions cover complete, incomplete and unsupported parameters.
    /// @throws None; failed assertions panic instead of returning errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn geolocation_parameters_follow_documented_unavailable_semantics() {
        for params in [json!({}), json!({"latitude": 10}), json!({"longitude": 20}),
            json!({"accuracy": 5}), json!({"latitude": 10, "longitude": 20}),
            json!({"latitude": 10, "accuracy": 5}), json!({"longitude": 20, "accuracy": 5})] {
            assert_eq!(geolocation_override(&params), Ok(None), "{params}");
        }
        assert_eq!(geolocation_override(&json!({"latitude": -90, "longitude": 180, "accuracy": 0})), Ok(Some((-90.0, 180.0, 0.0))));
        assert_eq!(geolocation_override(&json!({"latitude": 10.5, "longitude": 20.25, "accuracy": 37.5})), Ok(Some((10.5, 20.25, 37.5))));
        for params in [json!(null), json!([]), json!({"latitude": null}), json!({"latitude": "10"}),
            json!({"longitude": false}), json!({"accuracy": []}), json!({"latitude": 91}),
            json!({"latitude": -91}), json!({"longitude": 181}), json!({"longitude": -181}),
            json!({"accuracy": -0.1})] {
            assert!(geolocation_override(&params).is_err(), "must reject {params}");
        }
        for name in ["altitude", "altitudeAccuracy", "heading", "speed"] {
            let mut params = json!({"latitude": 10, "longitude": 20, "accuracy": 37.5});
            params[name] = json!(1);
            assert!(geolocation_override(&params).unwrap_err().contains("not supported"));
        }
    }

    /// Invalid commands must not partially mutate page readings or grant origin permissions.
    /// @param None; this test takes no arguments and creates no document/network activity.
    /// @return No value; assertions verify atomicity, accuracy, unavailable and clear state.
    /// @throws None; command failures and failed assertions panic instead of returning errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[tokio::test(flavor = "current_thread")]
    async fn geolocation_commands_are_atomic_and_do_not_grant_permission() {
        let mut ctx = CdpContext::new();
        let id = ctx.create_page();
        let session = Some("geolocation-session".to_string());
        ctx.sessions.insert(session.clone().unwrap(), id);
        let initial = json!({"latitude": 10, "longitude": 20, "accuracy": 37.5});
        handle("setGeolocationOverride", &initial, &mut ctx, &session).await.unwrap();
        for params in [json!({"latitude": "30", "longitude": 40, "accuracy": 1}),
            json!({"latitude": 30, "longitude": 200, "accuracy": 1}),
            json!({"latitude": 30, "longitude": 40, "accuracy": -1}),
            json!({"latitude": 30, "accuracy": "bad"}),
            json!({"latitude": 30, "longitude": 40, "accuracy": 1, "speed": 0})] {
            assert!(handle("setGeolocationOverride", &params, &mut ctx, &session).await.is_err());
            assert_eq!(ctx.get_session_page(&session).unwrap().geolocation_override, Some(Some((10.0, 20.0, 37.5))));
        }
        let policy = ctx.get_session_page(&session).unwrap().context.permissions.clone();
        assert_eq!(policy.query("https://geolocation.test", "geolocation").as_deref(), Some("prompt"));
        policy.set(Some("https://geolocation.test".into()), "geolocation", "denied").unwrap();
        handle("setGeolocationOverride", &initial, &mut ctx, &session).await.unwrap();
        assert_eq!(policy.query("https://geolocation.test", "geolocation").as_deref(), Some("denied"));
        for params in [json!({}), json!({"latitude": 10, "longitude": 20})] {
            handle("setGeolocationOverride", &params, &mut ctx, &session).await.unwrap();
            assert_eq!(ctx.get_session_page(&session).unwrap().geolocation_override, Some(None));
        }
        handle("clearGeolocationOverride", &json!({}), &mut ctx, &session).await.unwrap();
        assert_eq!(ctx.get_session_page(&session).unwrap().geolocation_override, None);
        assert_eq!(policy.query("https://geolocation.test", "geolocation").as_deref(), Some("denied"));
    }

    #[tokio::test]
    async fn color_scheme_override_persists_and_resets_without_partial_invalid_updates() {
        let mut ctx = CdpContext::new();
        let id = ctx.create_page();
        let session = Some("media-session".to_string());
        ctx.sessions.insert(session.clone().unwrap(), id);
        let both = json!({"features": [
            {"name": "prefers-color-scheme", "value": "dark"},
            {"name": "prefers-reduced-motion", "value": "reduce"}
        ]});
        handle("setEmulatedMedia", &both, &mut ctx, &session).await.unwrap();
        let script = "return [matchMedia('(prefers-color-scheme:dark)').matches, matchMedia('(prefers-reduced-motion:reduce)').matches];";
        for _ in 0..2 {
            let page = ctx.get_session_page_mut(&session).unwrap();
            page.navigate("data:text/html,<body>probe</body>").await.unwrap();
            assert_eq!(page.evaluate(script), json!([true, true]));
        }
        for invalid in [
            json!({"features": null}),
            json!({"features": [{"name":"prefers-color-scheme", "value":false}]}),
            json!({"features": [{"name":"prefers-color-scheme", "value":"light"}, {"name":"prefers-reduced-motion", "value":"invalid"}]}),
            json!({"features": [{"name":"prefers-color-scheme", "value":"invalid"}]}),
        ] {
            assert!(handle("setEmulatedMedia", &invalid, &mut ctx, &session).await.is_err());
            assert_eq!(ctx.get_session_page_mut(&session).unwrap().evaluate(script), json!([true, true]));
        }
        handle("setEmulatedMedia", &json!({}), &mut ctx, &session).await.unwrap();
        assert_eq!(ctx.get_session_page_mut(&session).unwrap().evaluate(script), json!([false, false]));
        handle("setEmulatedMedia", &both, &mut ctx, &session).await.unwrap();
        for value in ["light", "no-preference", ""] {
            handle("setEmulatedMedia", &json!({"features":[{"name":"prefers-color-scheme", "value":value}]}), &mut ctx, &session).await.unwrap();
            assert_eq!(ctx.get_session_page_mut(&session).unwrap().evaluate(script), json!([false, false]));
            handle("setEmulatedMedia", &both, &mut ctx, &session).await.unwrap();
        }
        handle("setEmulatedMedia", &json!({"features":[]}), &mut ctx, &session).await.unwrap();
        assert_eq!(ctx.get_session_page_mut(&session).unwrap().evaluate(script), json!([false, false]));
    }


    #[tokio::test]
    async fn device_metrics_override_updates_page_and_window_viewport() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("viewport-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);

        handle(
            "setDeviceMetricsOverride",
            &json!({
                "width": 1024,
                "height": 768,
                "deviceScaleFactor": 2,
                "mobile": false,
                "screenWidth": 1440,
                "screenHeight": 900
            }),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("metrics override");

        let page = ctx
            .get_session_page_mut(&session_id)
            .expect("page for session");
        assert_eq!(page.viewport, (1024.0, 768.0));
        assert_eq!(page.device_scale_factor, 2.0);
        assert_eq!(
            page.evaluate(
                "return [innerWidth, innerHeight, visualViewport.width,\
                         visualViewport.height, screen.width, screen.height,\
                         screen.availWidth, screen.availHeight, devicePixelRatio];"
            ),
            json!([1024, 768, 1024, 768, 1440, 900, 1440, 900, 2])
        );
    }

    #[tokio::test]
    async fn locale_emulation_reaches_requests_and_survives_navigation() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("locale-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);

        handle(
            "setUserAgentOverride",
            &json!({"userAgent": "", "acceptLanguage": "de-DE"}),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("accept-language override");
        handle(
            "setLocaleOverride",
            &json!({"locale": "de-DE"}),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("locale override");

        let http_client = ctx
            .get_session_page(&session_id)
            .unwrap()
            .http_client
            .clone();
        assert_eq!(http_client.accept_language.read().await.as_str(), "de-DE");
        assert_eq!(
            ctx.get_session_page_mut(&session_id)
                .unwrap()
                .evaluate("[navigator.language, navigator.languages]"),
            json!(["de-DE", ["de-DE"]])
        );

        crate::domains::page::handle(
            "navigate",
            &json!({"url": "data:text/html,<p>locale</p>", "waitUntil": "load"}),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("navigate");
        assert_eq!(
            ctx.get_session_page_mut(&session_id)
                .unwrap()
                .evaluate("[navigator.language, navigator.languages]"),
            json!(["de-DE", ["de-DE"]])
        );
    }

    #[tokio::test]
    async fn omitted_screen_metrics_clear_only_the_screen_override() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("screen-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);

        for params in [
            json!({
                "width": 1024,
                "height": 768,
                "deviceScaleFactor": 1,
                "mobile": false,
                "screenWidth": 1111,
                "screenHeight": 777
            }),
            json!({
                "width": 800,
                "height": 600,
                "deviceScaleFactor": 1,
                "mobile": false
            }),
        ] {
            handle("setDeviceMetricsOverride", &params, &mut ctx, &session_id)
                .await
                .unwrap();
        }

        let page = ctx.get_session_page_mut(&session_id).unwrap();
        assert_eq!(page.viewport, (800.0, 600.0));
        assert_eq!(
            page.evaluate(
                "return [innerWidth, innerHeight, screen.width !== 1111,\
                         screen.height !== 777];"
            ),
            json!([800, 600, true, true])
        );
    }

    #[tokio::test]
    async fn device_metrics_override_rejects_fractional_and_out_of_range_dimensions() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("viewport-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);
        for params in [
            json!({"width": 0.5, "height": 768, "deviceScaleFactor": 1, "mobile": false}),
            json!({"width": 10_000_001, "height": 768, "deviceScaleFactor": 1, "mobile": false}),
            json!({"width": -1, "height": 768, "deviceScaleFactor": 1, "mobile": false}),
        ] {
            assert!(
                handle("setDeviceMetricsOverride", &params, &mut ctx, &session_id)
                    .await
                    .is_err(),
                "must reject {params}"
            );
        }
    }

    #[tokio::test]
    async fn zero_dimensions_disable_size_override() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("zero-size-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);
        let page = ctx.get_session_page_mut(&session_id).unwrap();
        page.set_viewport((1111.0, 777.0));
        page.set_device_scale_factor(1.5);

        handle(
            "setDeviceMetricsOverride",
            &json!({
                "width": 0,
                "height": 0,
                "deviceScaleFactor": 0,
                "mobile": false
            }),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("zero disables the overrides");

        let page = ctx.get_session_page_mut(&session_id).unwrap();
        assert_eq!(page.viewport, (1111.0, 777.0));
        assert_eq!(page.device_scale_factor, 1.5);
    }

    #[tokio::test]
    async fn repeated_overrides_keep_baseline_and_clear_restores_it() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("scale-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);
        let page = ctx.get_session_page_mut(&session_id).unwrap();
        page.set_viewport((1111.0, 777.0));
        page.set_device_scale_factor(1.5);
        let baseline_screen = page.evaluate(
            "return [screen.width, screen.height, screen.availWidth, screen.availHeight];",
        );

        handle(
            "setDeviceMetricsOverride",
            &json!({
                "width": 640,
                "height": 480,
                "deviceScaleFactor": 3,
                "mobile": false,
                "screenWidth": 900,
                "screenHeight": 700
            }),
            &mut ctx,
            &session_id,
        )
        .await
        .unwrap();
        assert_eq!(
            ctx.get_session_page(&session_id)
                .unwrap()
                .device_scale_factor,
            3.0
        );

        handle(
            "setDeviceMetricsOverride",
            &json!({
                "width": 0,
                "height": 333,
                "deviceScaleFactor": 0,
                "mobile": false
            }),
            &mut ctx,
            &session_id,
        )
        .await
        .expect("zero restores the corresponding baseline metric");
        let page = ctx.get_session_page(&session_id).unwrap();
        assert_eq!(page.viewport, (1111.0, 333.0));
        assert_eq!(page.device_scale_factor, 1.5);

        handle(
            "clearDeviceMetricsOverride",
            &json!({}),
            &mut ctx,
            &session_id,
        )
        .await
        .unwrap();
        let page = ctx.get_session_page_mut(&session_id).unwrap();
        assert_eq!(page.viewport, (1111.0, 777.0));
        assert_eq!(page.device_scale_factor, 1.5);
        assert_eq!(
            page.evaluate(
                "return [screen.width, screen.height, screen.availWidth, screen.availHeight];"
            ),
            baseline_screen
        );
    }

    #[tokio::test]
    async fn inactive_clear_is_a_no_op() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("inactive-clear-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);
        let page = ctx.get_session_page_mut(&session_id).unwrap();
        page.set_viewport((901.0, 607.0));
        page.set_device_scale_factor(1.25);

        handle(
            "clearDeviceMetricsOverride",
            &json!({}),
            &mut ctx,
            &session_id,
        )
        .await
        .unwrap();

        let page = ctx.get_session_page(&session_id).unwrap();
        assert_eq!(page.viewport, (901.0, 607.0));
        assert_eq!(page.device_scale_factor, 1.25);
    }

    #[tokio::test]
    async fn mobile_without_complete_screen_size_uses_effective_viewport() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("mobile-screen-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);

        for params in [
            json!({
                "width": 800,
                "height": 600,
                "deviceScaleFactor": 1,
                "mobile": true
            }),
            json!({
                "width": 700,
                "height": 500,
                "deviceScaleFactor": 1,
                "mobile": true,
                "screenWidth": 1000
            }),
        ] {
            handle("setDeviceMetricsOverride", &params, &mut ctx, &session_id)
                .await
                .unwrap();
        }

        let page = ctx.get_session_page_mut(&session_id).unwrap();
        assert_eq!(
            page.evaluate(
                "return [screen.width, screen.height, screen.availWidth, screen.availHeight];"
            ),
            json!([700, 500, 700, 500])
        );
    }

    #[tokio::test]
    async fn validates_mobile_and_each_optional_screen_dimension() {
        let mut ctx = CdpContext::new();
        let page_id = ctx.create_page();
        let session_id = Some("validation-session".to_string());
        ctx.sessions.insert(session_id.clone().unwrap(), page_id);

        for params in [
            json!({"width": 800, "height": 600, "deviceScaleFactor": 1}),
            json!({"width": 800, "height": 600, "deviceScaleFactor": 1, "mobile": "false"}),
            json!({"width": 800, "height": 600, "deviceScaleFactor": 1, "mobile": false, "screenWidth": -1}),
            json!({"width": 800, "height": 600, "deviceScaleFactor": 1, "mobile": false, "screenHeight": 0.5}),
            json!({"width": 800, "height": 600, "deviceScaleFactor": 1, "mobile": false, "screenWidth": 10_000_001}),
        ] {
            assert!(
                handle("setDeviceMetricsOverride", &params, &mut ctx, &session_id)
                    .await
                    .is_err(),
                "must reject {params}"
            );
        }
    }

    #[test]
    fn default_background_color_matches_blink_defaults_rounding_and_clamping() {
        assert_eq!(default_background_color(&json!({})), Ok(None));
        assert_eq!(
            default_background_color(&json!({"color": {"r": 1, "g": 2, "b": 3}})),
            Ok(Some([1, 2, 3, 255]))
        );
        assert_eq!(
            default_background_color(&json!({
                "color": {"r": -20, "g": 400, "b": 30, "a": 16.0 / 255.0}
            })),
            Ok(Some([0, 255, 30, 16]))
        );
        assert_eq!(
            default_background_color(&json!({
                "color": {"r": 1, "g": 2, "b": 3, "a": 2}
            })),
            Ok(Some([1, 2, 3, 255]))
        );
        assert_eq!(
            default_background_color(&json!({
                "color": {"r": 1, "g": 2, "b": 3, "a": -1}
            })),
            Ok(Some([1, 2, 3, 0]))
        );
    }

    #[test]
    fn default_background_color_rejects_malformed_rgba() {
        for params in [
            json!({"color": null}),
            json!({"color": {"g": 2, "b": 3}}),
            json!({"color": {"r": 1.5, "g": 2, "b": 3}}),
            json!({"color": {"r": 1, "g": 2, "b": 3, "a": "opaque"}}),
        ] {
            assert!(
                default_background_color(&params).is_err(),
                "must reject {params}"
            );
        }
    }
}
