//! Browser-owned device configuration. Page scripts never configure or patch these values.
use serde_json::{json, Value};

/// Host-owned browser configuration and the current native geolocation reading.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-18
#[derive(Clone, Default)]
pub struct BrowserIdentity {
    /// Original device configuration, retained when a geolocation override is cleared.
    /// @var Option<Value> Validated profile object or no configured profile.
    profile: Option<Value>,
    /// Effective latitude, longitude and accuracy; absence means position unavailable.
    /// @var Option<(f64, f64, f64)> Degrees, degrees and non-negative meters.
    geolocation: Option<(f64, f64, f64)>,
    /// Stable seed used by the existing opt-in privacy configuration.
    /// @var u32 Native profile seed.
    seed: u32,
}

impl BrowserIdentity {
    /// Parse a device profile at the host boundary and resolve its native capabilities once.
    /// @param source JSON object supplied by the owning browser process.
    /// @return Configuration, or an error when the input is not a profile object.
    /// @throws serde_json::Error Returned for invalid JSON or a non-object profile.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-18
    pub fn parse(source: &str) -> Result<Self, serde_json::Error> {
        let mut profile: serde_json::Map<String, Value> = serde_json::from_str(source)?;
        let mobile = profile.get("is_mobile").and_then(Value::as_bool).unwrap_or(false);
        let safari = profile.get("is_safari_ios").and_then(Value::as_bool).unwrap_or(false);
        let seed_text = profile.get("canvas_noise_seed").or_else(|| profile.get("seed")).or_else(|| profile.get("id")).map(|value| value.as_str().map(str::to_owned).unwrap_or_else(|| value.to_string())).unwrap_or_default();
        let seed = seed_text.bytes().fold(0x811c9dc5_u32, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(0x01000193));
        let geolocation = profile_geolocation(&profile);
        let os = if safari { if profile.get("platform").and_then(Value::as_str) == Some("iPad") { "ipad" } else { "ios" } }
            else {
                let platform = profile.get("client_hints").and_then(|hints| hints.get("platform")).or_else(|| profile.get("platform")).and_then(Value::as_str).unwrap_or("").to_lowercase();
                if platform.contains("android") { "android" } else if platform.contains("mac") { "mac" } else if platform.contains("linux") { "linux" } else { "windows" }
            };
        profile.insert("native_os".into(), json!(os));
        profile.insert("native_seed".into(), json!(seed));
        profile.insert("native_voices".into(), voices(os));
        profile.insert("native_capabilities".into(), json!({
            "chromium": !safari, "standalone": safari, "pdf_viewer": !safari, "web_rtc":false, "mobile": mobile,
            "media_device_kinds": if safari { vec!["audioinput","videoinput"] } else { vec!["audioinput","videoinput","audiooutput"] },
            "battery": !safari, "network_information": !safari,
            "battery_level": if mobile { 0.95 } else { 1.0 },
            "notification_permission": "default",
        }));
        Ok(Self { profile: Some(Value::Object(profile)), geolocation, seed })
    }

    /// Return a serialized view for a newly initialized V8 realm, without installing globals or scripts.
    /// @return Device values shared by the page, its frames and workers.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn profile(&self) -> Option<Value> { self.profile.clone() }

    /// Update or remove the effective reading without changing the configured profile or permissions.
    /// @param self Native identity to update.
    /// @param position Latitude, longitude and accuracy, or None to emulate position unavailable.
    /// @return True when accepted; false leaves the previous reading unchanged.
    /// @throws None; invalid coordinates return false and no error is thrown.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn set_geolocation(&mut self, position: Option<(f64, f64, f64)>) -> bool {
        if position.is_some_and(|(latitude, longitude, accuracy)| !valid_position(latitude, longitude, accuracy)) { return false; }
        self.geolocation = position;
        true
    }

    /// Restore the profile reading, removing any effective override or unavailable error.
    /// @param self Native identity whose original profile supplies the default reading.
    /// @return No value; a profile without valid coordinates restores position unavailable.
    /// @throws None; this method does not return or throw errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn reset_geolocation(&mut self) {
        self.geolocation = self.profile.as_ref().and_then(Value::as_object).and_then(profile_geolocation);
    }

    /// Read configured geolocation; absence is reported as unavailable, never a fabricated city.
    /// @param self Native identity containing the effective reading.
    /// @return Position data or None when no location was configured.
    /// @throws None; this method does not return or throw errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-18
    pub fn position(&self) -> Option<Value> {
        self.geolocation.map(|(latitude, longitude, accuracy)| json!({"latitude":latitude,"longitude":longitude,"accuracy":accuracy,"altitude":null,"altitudeAccuracy":null,"heading":null,"speed":null}))
    }

    /// Read an explicitly selected privacy option; omitted flags do not silently enable hooks.
    /// @param name Privacy option. @return Whether the native option is enabled.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn privacy_enabled(&self, name: &str) -> bool {
        self.profile.as_ref().and_then(|profile| profile.get("anti_fingerprint")).and_then(|options| options.get(name)).and_then(Value::as_bool).unwrap_or(false)
    }

    /// Scale observable client rectangles at the native geometry boundary, leaving integer box metrics intact.
    /// @return Scale factor, or one when the option is disabled.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn rectangle_scale(&self) -> f32 {
        if !self.privacy_enabled("clientRects") { return 1.0; }
        let magnitude = (1 + self.seed % 997) as f32 * 1e-8;
        1.0 + if self.seed % 2 == 1 { magnitude } else { -magnitude }
    }

    /// Measure the selected profile font in Rust, keeping optional noise out of JavaScript wrappers.
    /// @param font Parsed CSS font. @param text Text. @return Native metrics.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn measure_font(&self, font: &Value, text: &str) -> Value {
        let os = self.profile.as_ref().and_then(|profile| profile["native_os"].as_str()).unwrap_or("windows");
        let scale = if self.privacy_enabled("fonts") { 1.0 + f64::from(1 + self.seed % 997) * 1e-8 } else { 1.0 };
        crate::browser_fonts::measure(os, font, text, scale)
    }

    /// Apply stable canvas privacy to a readback copy, without modifying the backing surface.
    /// @param pixels RGBA readback bytes. @param x Left origin. @param y Top origin. @param width Row width.
    /// @return No value; disabled privacy keeps the copy unchanged.
    /// @author ductv <ductv@getflycrm.com> @since 2026-11-18
    pub fn canvas_readback(&self, pixels: &mut [u8], x: i32, y: i32, width: u32) {
        if !self.privacy_enabled("canvas") || width == 0 { return; }
        for (index, pixel) in pixels.chunks_exact_mut(4).enumerate() {
            if pixel[3] == 0 { continue; }
            let salt = 7001_i32.wrapping_add(x.wrapping_add((index % width as usize) as i32).wrapping_mul(7919)).wrapping_add(y.wrapping_add((index / width as usize) as i32).wrapping_mul(6271));
            let mut hash = self.seed ^ salt as u32;
            hash = (hash ^ (hash >> 16)).wrapping_mul(0x45d9f3b);
            hash = (hash ^ (hash >> 13)).wrapping_mul(0x45d9f3b);
            let noise = ((f64::from(hash ^ (hash >> 16)) / f64::from(u32::MAX)) * 65536.0).floor() as u32;
            if noise & 15 == 0 { pixel[((noise >> 4) % 3) as usize] ^= 1; }
        }
    }

    /// Resolve the profile's WebGL limits, extensions and renderer strings in native state.
    /// @param version WebGL version, where 1 selects WebGL 1 and every other value selects WebGL 2.
    /// @return JSON object with `parameters` and `extensions` consumed by the Web IDL wrapper.
    /// @throws None; incomplete profiles use Chromium-compatible fallback values.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn webgl_parameters(&self, version: u32) -> Value {
        let version = if version == 2 { 2 } else { 1 };
        let profile = self.profile.as_ref().and_then(Value::as_object);
        let safari = profile.and_then(|profile| profile.get("is_safari_ios")).and_then(Value::as_bool).unwrap_or(false);
        let mobile = profile.and_then(|profile| profile.get("is_mobile")).and_then(Value::as_bool).unwrap_or(false);
        let os = profile.and_then(|profile| profile.get("native_os")).and_then(Value::as_str).unwrap_or("windows");
        let webgl = profile.and_then(|profile| profile.get("webgl")).and_then(Value::as_object);
        let vendor = webgl.and_then(|webgl| webgl.get("unmasked_vendor")).and_then(Value::as_str).unwrap_or("Google Inc. (Intel)");
        let renderer = webgl.and_then(|webgl| webgl.get("unmasked_renderer")).and_then(Value::as_str).unwrap_or("ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.6)");
        let gpu_family = webgl_gpu_family(vendor, renderer);
        let mobile_limits = mobile || matches!(gpu_family, "adreno" | "mali");
        let mut parameters = serde_json::Map::new();
        parameters.insert("7936".into(), json!("WebKit"));
        parameters.insert("7937".into(), json!("WebKit WebGL"));
        parameters.insert("7938".into(), json!(if safari { format!("WebGL {version}.0") } else if version == 2 { "WebGL 2.0 (OpenGL ES 3.0 Chromium)".into() } else { "WebGL 1.0 (OpenGL ES 2.0 Chromium)".into() }));
        parameters.insert("35724".into(), json!(if safari { if version == 2 { "WebGL GLSL ES 3.00" } else { "WebGL GLSL ES 1.0" } } else if version == 2 { "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)" } else { "WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)" }));
        parameters.insert("37445".into(), json!(vendor));
        parameters.insert("37446".into(), json!(renderer));
        parameters.insert("3379".into(), json!(if mobile_limits && !safari { 8192 } else { 16384 }));
        parameters.insert("3386".into(), json!(if mobile_limits && !safari { [16384, 16384] } else { [32767, 32767] }));
        parameters.insert("34024".into(), json!(if mobile_limits && !safari { 8192 } else { 16384 }));
        parameters.insert("34076".into(), json!(if mobile_limits && !safari { 8192 } else { 16384 }));
        parameters.insert("34921".into(), json!(16));
        parameters.insert("36347".into(), json!(if os == "windows" && !mobile_limits { 4096 } else if mobile_limits { 256 } else { 1024 }));
        parameters.insert("36349".into(), json!(if mobile_limits { 224 } else { 1024 }));
        parameters.insert("36348".into(), json!(if mobile_limits { 31 } else { 30 }));
        parameters.insert("34930".into(), json!(16));
        parameters.insert("35660".into(), json!(16));
        parameters.insert("35661".into(), json!(if os == "windows" && !mobile_limits { 32 } else if mobile_limits { 96 } else { 80 }));
        parameters.insert("33901".into(), json!([1, if mobile_limits { 511 } else { 1024 }]));
        parameters.insert("33902".into(), json!([1, if mobile_limits { 8 } else { 1 }]));
        parameters.insert("3408".into(), json!(4));
        parameters.insert("3410".into(), json!(8));
        parameters.insert("3411".into(), json!(8));
        parameters.insert("3412".into(), json!(8));
        parameters.insert("3413".into(), json!(8));
        parameters.insert("3414".into(), json!(24));
        parameters.insert("3415".into(), json!(0));
        parameters.insert("34047".into(), json!(16));
        let extensions = webgl_extensions(mobile_limits, version);
        let shader_precision = if mobile_limits || gpu_family == "apple" {
            json!({
                "36338": [127, 127, 23], "36337": [15, 15, 10], "36336": [8, 8, 10],
                "36341": [31, 30, 0], "36340": [15, 14, 0], "36339": [8, 8, 0]
            })
        } else {
            json!({
                "36338": [127, 127, 23], "36337": [127, 127, 23], "36336": [127, 127, 23],
                "36341": [31, 30, 0], "36340": [31, 30, 0], "36339": [31, 30, 0]
            })
        };
        json!({"parameters": parameters, "extensions": extensions, "shaderPrecision": shader_precision, "gpuFamily": gpu_family})
    }

    /// Fill a WebGL RGBA/UNSIGNED_BYTE readback from the profile seed without a JavaScript pixel loop.
    /// @param pixels Destination byte buffer supplied by the Web IDL wrapper.
    /// @param x Left readback coordinate.
    /// @param y Bottom readback coordinate.
    /// @param width Requested row width.
    /// @param height Requested row height.
    /// @return No value; bytes are deterministic for the identity and coordinates.
    /// @throws None; buffers shorter than width times height are filled up to their available length.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    pub fn webgl_readback(&self, pixels: &mut [u8], x: i32, y: i32, width: u32, height: u32) {
        if pixels.is_empty() || width == 0 || height == 0 { return; }
        for (index, pixel) in pixels.chunks_exact_mut(4).enumerate() {
            let row = index / width as usize;
            let column = index % width as usize;
            if row >= height as usize { break; }
            let rgb = webgl_pixel(self.seed, x.wrapping_add(column as i32), y.wrapping_add(row as i32));
            pixel[0] = rgb[0];
            pixel[1] = rgb[1];
            pixel[2] = rgb[2];
            pixel[3] = 255;
        }
    }
}

/// Return the bounded extension set advertised by the selected native profile.
/// @param mobile Whether the profile is a mobile device.
/// @param version WebGL version.
/// @return Extension names in stable order.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn webgl_extensions(mobile: bool, version: u32) -> Vec<&'static str> {
    if mobile {
        if version == 2 { vec!["EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_disjoint_timer_query_webgl2", "EXT_float_blend", "EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile", "OES_texture_float_linear", "OVR_multiview2", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_lose_context", "WEBGL_multi_draw"] }
        else { vec!["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_color_buffer_half_float", "EXT_disjoint_timer_query", "EXT_float_blend", "EXT_frag_depth", "EXT_shader_texture_lod", "EXT_sRGB", "EXT_texture_filter_anisotropic", "KHR_parallel_shader_compile", "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object", "WEBGL_color_buffer_float", "WEBGL_compressed_texture_astc", "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_etc1", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture", "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw"] }
    } else if version == 2 {
        vec!["EXT_clip_control", "EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_conservative_depth", "EXT_depth_clamp", "EXT_disjoint_timer_query_webgl2", "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_render_snorm", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_texture_norm16", "KHR_parallel_shader_compile", "NV_shader_noperspective_interpolation", "OES_draw_buffers_indexed", "OES_sample_variables", "OES_shader_multisample_interpolation", "OES_texture_float_linear", "OVR_multiview2", "WEBGL_blend_func_extended", "WEBGL_clip_cull_distance", "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode", "WEBGL_provoking_vertex", "WEBGL_stencil_texturing"]
    } else {
        vec!["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_clip_control", "EXT_color_buffer_half_float", "EXT_depth_clamp", "EXT_disjoint_timer_query", "EXT_float_blend", "EXT_frag_depth", "EXT_polygon_offset_clamp", "EXT_shader_texture_lod", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_sRGB", "KHR_parallel_shader_compile", "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float", "OES_texture_float_linear", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object", "WEBGL_blend_func_extended", "WEBGL_color_buffer_float", "WEBGL_compressed_texture_s3tc", "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture", "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode"]
    }
}

/// Produce three deterministic RGB bytes for one WebGL readback coordinate.
/// @param seed Native profile seed.
/// @param x Pixel X coordinate.
/// @param y Pixel Y coordinate.
/// @return RGB bytes in the 0..255 range. Alpha is supplied by the caller.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn webgl_pixel(seed: u32, x: i32, y: i32) -> [u8; 3] {
    let salt = 9_100_i32.wrapping_add(x.wrapping_mul(7_919)).wrapping_add(y.wrapping_mul(6_271));
    let mut hash = seed ^ salt as u32;
    hash = (hash ^ (hash >> 16)).wrapping_mul(0x45d9f3b);
    hash = (hash ^ (hash >> 13)).wrapping_mul(0x45d9f3b);
    let mixed = hash ^ (hash >> 16);
    [mixed as u8, (mixed >> 8) as u8, (mixed >> 16) as u8]
}

/// Classify the renderer into a stable GPU family for profile-specific limits.
/// @param vendor Unmasked WebGL vendor string.
/// @param renderer Unmasked WebGL renderer string.
/// @return Lowercase GPU family name used by the native profile.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn webgl_gpu_family(vendor: &str, renderer: &str) -> &'static str {
    let value = format!("{vendor} {renderer}").to_ascii_lowercase();
    if value.contains("apple") || value.contains("m1") || value.contains("m2") || value.contains("m3") || value.contains("m4") {
        "apple"
    } else if value.contains("adreno") {
        "adreno"
    } else if value.contains("mali") {
        "mali"
    } else if value.contains("nvidia") || value.contains("geforce") || value.contains("rtx") {
        "nvidia"
    } else if value.contains("amd") || value.contains("radeon") {
        "amd"
    } else if value.contains("intel") || value.contains("iris") || value.contains("uhd") {
        "intel"
    } else {
        "generic"
    }
}

/// Construct the profile voice catalogue in native configuration, not an application getter patch.
/// @param os Profile OS. @return Voice metadata used by the engine's Web IDL objects.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
fn voices(os: &str) -> Value {
    static DATA: std::sync::OnceLock<Value> = std::sync::OnceLock::new();
    let data = DATA.get_or_init(|| serde_json::from_str(include_str!("../data/profile-voices.json")).expect("embedded voice data must be valid JSON"));
    let system = match os { "windows" => "windows", "mac" | "ios" | "ipad" => "apple", "android" => "android", _ => return json!([]) };
    let mut result = Vec::new();
    for (list, local) in [(system, true), ("google", false)] {
        if !local && !matches!(os, "windows" | "mac") { continue; }
        if let Some(voices) = data[list].as_array() {
            for (index, voice) in voices.iter().enumerate() {
                let name = voice[0].as_str().unwrap_or(""); let lang = voice[1].as_str().unwrap_or("");
                let uri = if matches!(os, "ios" | "ipad") { format!("com.apple.voice.compact.{lang}.{name}") } else { name.to_string() };
                result.push(json!({"name":name,"lang":lang,"localService":local,"default":local && index == 0,"voiceURI":uri}));
            }
        }
    }
    json!(result)
}

/// Read an optional profile location, retaining the legacy ten-meter accuracy default.
/// @param profile Validated device profile object.
/// @return Valid latitude, longitude and accuracy, or None for an absent or malformed reading.
/// @throws None; malformed location fields return None without throwing an error.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
fn profile_geolocation(profile: &serde_json::Map<String, Value>) -> Option<(f64, f64, f64)> {
    let position = profile.get("geolocation")?;
    let latitude = position.get("latitude")?.as_f64()?;
    let longitude = position.get("longitude")?.as_f64()?;
    let accuracy = match position.get("accuracy") { Some(value) => value.as_f64()?, None => 10.0 };
    valid_position(latitude, longitude, accuracy).then_some((latitude, longitude, accuracy))
}

/// Validate a complete reading at the shared native configuration boundary.
/// @param latitude Latitude in degrees, between -90 and 90 inclusive.
/// @param longitude Longitude in degrees, between -180 and 180 inclusive.
/// @param accuracy Non-negative finite horizontal accuracy in meters.
/// @return Whether all three fields are finite and within range.
/// @throws None; invalid readings return false without throwing an error.
/// @author ductv <ductv@getflycrm.com>
/// @since 2026-11-19
pub fn valid_position(latitude: f64, longitude: f64, accuracy: f64) -> bool {
    latitude.is_finite() && longitude.is_finite() && accuracy.is_finite() && accuracy >= 0.0
        && (-90.0..=90.0).contains(&latitude) && (-180.0..=180.0).contains(&longitude)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Native privacy must obey every checkbox and leave the backing input untouched when disabled.
    /// @return No value. @author ductv <ductv@getflycrm.com> @since 2026-11-18
    #[test]
    fn privacy_is_opt_in_and_canvas_readback_is_stable() {
        let disabled = BrowserIdentity::parse(r#"{"seed":12}"#).unwrap();
        let enabled = BrowserIdentity::parse(r#"{"seed":12,"anti_fingerprint":{"canvas":true,"clientRects":true}}"#).unwrap();
        let source = vec![120; 4096];
        let mut plain = source.clone(); disabled.canvas_readback(&mut plain, 0, 0, 32);
        assert_eq!(plain, source); assert_eq!(disabled.rectangle_scale(), 1.0);
        let mut first = source.clone(); let mut second = source.clone();
        enabled.canvas_readback(&mut first, 0, 0, 32); enabled.canvas_readback(&mut second, 0, 0, 32);
        assert_eq!(first, second); assert_ne!(first, source); assert_ne!(enabled.rectangle_scale(), 1.0);
    }

    /// Coordinates and platform capabilities come from typed native state rather than injected globals.
    /// @param None; this test takes no arguments.
    /// @return No value; assertions verify native configuration.
    /// @throws None; assertion failures panic instead of returning errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-18
    #[test]
    fn coordinates_are_validated_and_safari_capabilities_are_explicit() {
        let mut identity = BrowserIdentity::parse(r#"{"is_safari_ios":true,"geolocation":{"latitude":40,"longitude":-73}}"#).unwrap();
        assert_eq!(identity.position().unwrap()["latitude"].as_f64(), Some(40.0));
        assert!(!identity.set_geolocation(Some((91.0, 0.0, 10.0))));
        assert_eq!(identity.profile().unwrap()["native_capabilities"]["battery"], false);
        assert_eq!(BrowserIdentity::default().position(), None);
        assert!(BrowserIdentity::parse("[]").is_err());
    }

    /// Invalid readings are atomic, accuracy is retained and reset restores only the profile default.
    /// @param None; this test takes no arguments.
    /// @return No value; assertions verify the effective reading and its baseline.
    /// @throws None; assertion failures panic instead of returning errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn geolocation_accuracy_clear_and_reset_preserve_native_state() {
        let mut identity = BrowserIdentity::parse(r#"{"geolocation":{"latitude":40,"longitude":-73,"accuracy":2.5}}"#).unwrap();
        assert_eq!(identity.position().unwrap()["accuracy"].as_f64(), Some(2.5));
        assert!(identity.set_geolocation(Some((10.0, 20.0, 37.5))));
        let before = identity.position();
        for invalid in [(91.0, 0.0, 1.0), (0.0, 181.0, 1.0), (0.0, 0.0, -1.0),
            (f64::NAN, 0.0, 1.0), (0.0, f64::INFINITY, 1.0), (0.0, 0.0, f64::INFINITY)] {
            assert!(!identity.set_geolocation(Some(invalid)));
            assert_eq!(identity.position(), before);
        }
        assert_eq!(before.unwrap()["accuracy"].as_f64(), Some(37.5));
        assert!(identity.set_geolocation(None));
        assert_eq!(identity.position(), None);
        identity.reset_geolocation();
        assert_eq!(identity.position().unwrap()["accuracy"].as_f64(), Some(2.5));
        let mut empty = BrowserIdentity::default();
        assert!(empty.set_geolocation(Some((0.0, 0.0, 0.0))));
        empty.reset_geolocation();
        assert_eq!(empty.position(), None);
        for source in [r#"{"geolocation":{"latitude":0,"longitude":0,"accuracy":-1}}"#,
            r#"{"geolocation":{"latitude":0,"longitude":0,"accuracy":"10"}}"#] {
            assert_eq!(BrowserIdentity::parse(source).unwrap().position(), None);
        }
    }

    /// WebGL metadata and readback remain profile-specific, deterministic and alpha-safe.
    /// @param None; this test takes no arguments.
    /// @return No value; assertions verify native WebGL configuration.
    /// @throws None; assertion failures panic instead of returning errors.
    /// @author ductv <ductv@getflycrm.com>
    /// @since 2026-11-19
    #[test]
    fn webgl_profile_and_readback_are_native_and_stable() {
        let first = BrowserIdentity::parse(r#"{"seed":4242,"is_mobile":false,"native_os":"windows","webgl":{"unmasked_vendor":"Google Inc. (NVIDIA)","unmasked_renderer":"ANGLE (NVIDIA, RTX)"}}"#).unwrap();
        let second = BrowserIdentity::parse(r#"{"seed":4242,"is_mobile":false,"native_os":"windows","webgl":{"unmasked_vendor":"Google Inc. (NVIDIA)","unmasked_renderer":"ANGLE (NVIDIA, RTX)"}}"#).unwrap();
        let third = BrowserIdentity::parse(r#"{"seed":4243,"is_mobile":false,"native_os":"windows","webgl":{"unmasked_vendor":"Google Inc. (NVIDIA)","unmasked_renderer":"ANGLE (NVIDIA, RTX)"}}"#).unwrap();
        assert_eq!(first.webgl_parameters(1), second.webgl_parameters(1));
        assert_eq!(first.webgl_parameters(1)["parameters"]["37445"], "Google Inc. (NVIDIA)");
        assert_eq!(first.webgl_parameters(1)["gpuFamily"], "nvidia");
        assert_eq!(first.webgl_parameters(1)["shaderPrecision"]["36337"], serde_json::json!([127, 127, 23]));
        assert!(first.webgl_parameters(2)["extensions"].as_array().unwrap().iter().any(|extension| extension == "WEBGL_debug_renderer_info"));
        let apple = BrowserIdentity::parse(r#"{"seed":7,"is_mobile":false,"webgl":{"unmasked_vendor":"Apple","unmasked_renderer":"Apple M3"}}"#).unwrap();
        assert_eq!(apple.webgl_parameters(1)["gpuFamily"], "apple");
        assert_eq!(apple.webgl_parameters(1)["shaderPrecision"]["36337"], serde_json::json!([15, 15, 10]));
        let mut first_pixels = vec![0; 4 * 3 * 2];
        let mut second_pixels = vec![0; 4 * 3 * 2];
        let mut third_pixels = vec![0; 4 * 3 * 2];
        first.webgl_readback(&mut first_pixels, 0, 0, 3, 2);
        second.webgl_readback(&mut second_pixels, 0, 0, 3, 2);
        third.webgl_readback(&mut third_pixels, 0, 0, 3, 2);
        assert_eq!(first_pixels, second_pixels);
        assert_ne!(first_pixels, third_pixels);
        assert!(first_pixels.chunks_exact(4).all(|pixel| pixel[3] == 255));
    }
}
