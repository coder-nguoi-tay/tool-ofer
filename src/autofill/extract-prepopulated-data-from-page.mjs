/**
 * Trích xuất dữ liệu người dùng / địa lý đã có sẵn từ các biến JavaScript toàn cục trên trang
 * (ví dụ: window.globalData của SweepstakesAlerts/LaunchPotato, window.pushyUserData,
 * window.jLead và window.AF của Uplevel Rewards, window.dataLayer).
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @return {Promise<object>} Dữ liệu trích xuất được (email, city, state, zipcode, phone, firstname, lastname).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function extractPrepopulatedDataFromPage(frame) {
  if (!frame || typeof frame.evaluate !== 'function') return {};
  try {
    return await frame.evaluate(() => {
      const extracted = {};

      // 1. LaunchPotato / SweepstakesAlerts: window.globalData
      if (typeof window !== 'undefined' && window.globalData) {
        const s = window.globalData.sessionData || {};
        const g = window.globalData.geolocation || {};
        if (s.email && typeof s.email === 'string' && s.email.includes('@')) {
          extracted.email = s.email.trim();
        }
        if (s.city && typeof s.city === 'string' && s.city.trim().length > 1) {
          extracted.city = s.city.trim();
        }
        if (s.zipcode && typeof s.zipcode === 'string' && /^\d{5}/.test(s.zipcode)) {
          extracted.zipcode = s.zipcode.slice(0, 5);
        }
        if (s.state && typeof s.state === 'string' && s.state.trim().length >= 2) {
          extracted.state = s.state.trim().toUpperCase();
        }
        if (s.firstname && typeof s.firstname === 'string' && s.firstname.trim().length > 0) {
          extracted.firstname = s.firstname.trim();
        }
        if (s.lastname && typeof s.lastname === 'string' && s.lastname.trim().length > 0) {
          extracted.lastname = s.lastname.trim();
        }
        if (s.phone && typeof s.phone === 'string' && s.phone.replace(/\D/g, '').length >= 10) {
          extracted.phone = s.phone.replace(/\D/g, '').slice(-10);
        }
        if (s.gender && typeof s.gender === 'string' && s.gender.trim().length > 0) {
          extracted.gender = s.gender.trim();
        }

        // Bổ sung từ geolocation nếu sessionData còn trống
        if (!extracted.state && g.stateAbbreviation && typeof g.stateAbbreviation === 'string') {
          extracted.state = g.stateAbbreviation.trim().toUpperCase();
        }
        if (!extracted.city && g.city && typeof g.city === 'string') {
          extracted.city = g.city.trim();
        }
        if (!extracted.zipcode && g.zipcode && typeof g.zipcode === 'string' && /^\d{5}/.test(g.zipcode)) {
          extracted.zipcode = g.zipcode.slice(0, 5);
        }
      }

      // 2. Pushy Notification Data: window.pushyUserData
      if (typeof window !== 'undefined' && window.pushyUserData && window.pushyUserData.pii) {
        const p = window.pushyUserData.pii;
        if (p.email && typeof p.email === 'string' && p.email.includes('@') && !extracted.email) {
          extracted.email = p.email.trim();
        }
        if (p.city && typeof p.city === 'string' && p.city.trim().length > 1 && !extracted.city) {
          extracted.city = p.city.trim();
        }
        if (p.zip && typeof p.zip === 'string' && /^\d{5}/.test(p.zip) && !extracted.zipcode) {
          extracted.zipcode = p.zip.slice(0, 5);
        }
        if (p.state && typeof p.state === 'string' && p.state.trim().length >= 2 && !extracted.state) {
          extracted.state = p.state.trim().toUpperCase();
        }
        if (p.firstname && typeof p.firstname === 'string' && !extracted.firstname) {
          extracted.firstname = p.firstname.trim();
        }
        if (p.lastname && typeof p.lastname === 'string' && !extracted.lastname) {
          extracted.lastname = p.lastname.trim();
        }
        if (p.phone && typeof p.phone === 'string' && p.phone.replace(/\D/g, '').length >= 10 && !extracted.phone) {
          extracted.phone = p.phone.replace(/\D/g, '').slice(-10);
        }
      }

      // 3. Uplevel Rewards: window.jLead & window.AF.Lead
      if (typeof window !== 'undefined' && window.jLead) {
        const j = window.jLead;
        if (j.email && typeof j.email === 'string' && j.email.includes('@') && !extracted.email) {
          extracted.email = j.email.trim();
        }
        if (j.phone && !extracted.phone) {
          const digits = String(j.phone).replace(/\D/g, '');
          if (digits.length >= 10) extracted.phone = digits.slice(-10);
        }
        if (j.first_name && !extracted.firstname) extracted.firstname = String(j.first_name).trim();
        if (j.last_name && !extracted.lastname) extracted.lastname = String(j.last_name).trim();
        if (j.zip && !extracted.zipcode) {
          const z = String(j.zip).replace(/\D/g, '');
          if (z.length === 5) extracted.zipcode = z;
        }
        if (j.state && !extracted.state) extracted.state = String(j.state).trim().toUpperCase();
        if (j.city && !extracted.city) extracted.city = String(j.city).trim();
      }
      if (typeof window !== 'undefined' && window.AF?.Lead?.v) {
        const v = window.AF.Lead.v;
        if (v.Email && typeof v.Email === 'string' && v.Email.includes('@') && !extracted.email) {
          extracted.email = v.Email.trim();
        }
        if (v.Zip && !extracted.zipcode) {
          const z = String(v.Zip).replace(/\D/g, '');
          if (z.length === 5) extracted.zipcode = z;
        }
        if (v.State && !extracted.state) extracted.state = String(v.State).trim().toUpperCase();
        if (v.City && !extracted.city) extracted.city = String(v.City).trim();
      }
      return extracted;
    });
  } catch {
    return {};
  }
}
export { extractPrepopulatedDataFromPage };
