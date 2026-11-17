/// Bộ sinh số ngẫu nhiên giả lập (PRNG) thuật toán XorShift64Star.
/// Được chuyển đổi từ các thư viện Anti-Detect C# để đảm bảo tính nhất quán (deterministic) theo profile seed.
pub struct XorShift64 {
    state: u64,
}

impl XorShift64 {
    pub fn new(seed: u64) -> Self {
        // Tránh seed = 0 gây treo thuật toán xorshift
        let state = if seed == 0 { 0x853c49e6748fea9b } else { seed };
        Self { state }
    }

    /// Trả về số nguyên 64-bit ngẫu nhiên tiếp theo
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545F4914F6CDD1D)
    }

    /// Trả về số thực f64 trong khoảng [0.0, 1.0)
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Trả về độ lệch nhiễu pixel cho Canvas (-1, 0, hoặc 1)
    pub fn next_canvas_pixel_delta(&mut self) -> i32 {
        let val = (self.next_u64() % 3) as i32;
        val - 1 // Kết quả: -1, 0, 1
    }

    /// Trả về độ lệch nhiễu âm thanh cho AudioContext [-0.0001, 0.0001]
    pub fn next_audio_delta(&mut self) -> f32 {
        let f = self.next_f64() as f32; // [0.0, 1.0]
        (f - 0.5) * 0.0002 // dao động rất nhỏ, người nghe không nhận ra nhưng hash audio bị đổi
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_noise() {
        let mut prng1 = XorShift64::new(12345);
        let mut prng2 = XorShift64::new(12345);

        for _ in 0..100 {
            assert_eq!(prng1.next_canvas_pixel_delta(), prng2.next_canvas_pixel_delta());
            assert_eq!(prng1.next_audio_delta(), prng2.next_audio_delta());
        }
    }
}
