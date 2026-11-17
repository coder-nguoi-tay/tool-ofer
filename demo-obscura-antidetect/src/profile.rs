use serde::{Deserialize, Serialize};

/// Thông số màn hình của thiết bị
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenConfig {
    pub width: u32,
    pub height: u32,
    pub avail_width: u32,
    pub avail_height: u32,
    pub color_depth: u32,
    pub pixel_depth: u32,
    pub device_pixel_ratio: f32,
}

/// Thông số WebGL đồ họa
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebGlConfig {
    pub unmasked_vendor: String,
    pub unmasked_renderer: String,
    pub vendor: String,
    pub renderer: String,
}

/// Thông số Client Hints (User-Agent Data của Chrome mới)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrandVersion {
    pub brand: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientHintsConfig {
    pub brands: Vec<BrandVersion>,
    pub mobile: bool,
    pub platform: String,
    pub platform_version: String,
    pub architecture: String,
    pub bitness: String,
    pub model: String,
}

/// Cấu hình hồ sơ vân tay thiết bị (Anti-Detect Profile)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AntiDetectProfile {
    pub id: String,
    pub os: String,
    pub platform: String,
    pub vendor: String,
    pub user_agent: String,
    pub chrome_version: String,
    pub hardware_concurrency: u32,
    pub device_memory: u32,
    pub max_touch_points: u32,
    pub is_mobile: bool,
    pub is_safari_ios: bool,
    pub languages: Vec<String>,
    pub timezone: String,
    pub screen: ScreenConfig,
    pub webgl: WebGlConfig,
    pub client_hints: Option<ClientHintsConfig>,
    pub canvas_noise_seed: u64,
    pub audio_noise_seed: u64,
}
