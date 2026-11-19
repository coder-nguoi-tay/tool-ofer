//! Profile font metrics, calculated in Rust from the existing emulation data.
use serde_json::{json, Value};
use std::sync::OnceLock;

/// Measure a profile's configured font model without patching canvas methods from the application.
/// @param os Device OS. @param font Parsed CSS font descriptor. @param text Text. @param scale Opt-in privacy scale.
/// @return Metrics for the engine's TextMetrics wrapper.
/// @author ductv <ductv@getflycrm.com> @since 2026-11-18
pub(crate) fn measure(os: &str, font: &Value, text: &str, scale: f64) -> Value {
    static DATA: OnceLock<Value> = OnceLock::new();
    let data = DATA.get_or_init(|| serde_json::from_str(include_str!("../data/profile-fonts.json")).expect("embedded font data must be valid JSON"));
    let os = if os == "ipad" { "ios" } else { os };
    let installed = data["fonts"].get(os).unwrap_or(&data["fonts"]["windows"]);
    let generic = data["generic"].get(os).unwrap_or(&data["generic"]["windows"]);
    let model = font["families"].as_array().and_then(|families| families.iter().find_map(|family| {
        let family = family.as_str()?;
        installed.get(generic.get(family).and_then(Value::as_str).unwrap_or(family))
    })).unwrap_or_else(|| &installed[generic["serif"].as_str().unwrap_or("times new roman")]);
    let kind = model[0].as_str().unwrap_or("sans");
    let factor = model[1].as_f64().unwrap_or(1.0);
    let size = font["size"].as_f64().filter(|size| size.is_finite() && *size > 0.0).unwrap_or(10.0);
    let units: f64 = text.chars().map(|character| {
        let code = character as usize;
        if code >= 0x2e80 { 1000.0 }
        else if kind == "mono" { factor }
        else if (32..=126).contains(&code) { data["advances"][kind][code - 32].as_f64().unwrap_or(556.0) * factor }
        else if kind == "serif" { 500.0 * factor }
        else { 556.0 * factor }
    }).sum();
    let width = units / 1000.0 * size * if font["bold"] == true { 1.05 } else { 1.0 } * scale;
    let ascent = if text.chars().any(|character| character.is_ascii_uppercase() || character.is_ascii_digit() || "bdfhklt'\"!?|[](){}/\\@#$%&^".contains(character)) { 0.716 * size }
        else if text.chars().any(|character| !character.is_whitespace()) { 0.519 * size } else { 0.0 };
    let descent = if text.chars().any(|character| "gjpqy,;()[]{}|@_".contains(character)) { 0.21 * size } else { 0.0 };
    let font_ascent = match kind { "serif" => 0.891, "mono" => 0.833, _ => 0.905 } * size;
    let font_descent = match kind { "serif" => 0.216, "mono" => 0.3, _ => 0.212 } * size;
    json!({"width":width,"actualBoundingBoxLeft":0,"actualBoundingBoxRight":width,"actualBoundingBoxAscent":ascent,"actualBoundingBoxDescent":descent,
        "fontBoundingBoxAscent":font_ascent,"fontBoundingBoxDescent":font_descent,"emHeightAscent":font_ascent,"emHeightDescent":font_descent,
        "alphabeticBaseline":0,"hangingBaseline":font_ascent * 0.8,"ideographicBaseline":-font_descent})
}
