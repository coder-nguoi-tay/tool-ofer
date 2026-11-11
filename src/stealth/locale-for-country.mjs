import { countryLocales } from './state/country-locales.mjs';

/**
 * Chọn ngôn ngữ trình duyệt khớp quốc gia của IP proxy.
 *
 * @param {string|undefined} countryCode Mã quốc gia ISO (ipinfo.io `country`).
 * @return {{locale: string, languages: string[]}} locale cho Intl và danh sách navigator.languages.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function localeForCountry(countryCode) {
  const locale = countryLocales[String(countryCode ?? '').toUpperCase()] ?? 'en-US';
  const language = locale.split('-')[0];
  const languages = language === 'en' ? locale === 'en-US' ? ['en-US', 'en'] : [locale, 'en-US', 'en'] : [locale, language, 'en-US', 'en'];
  return {
    locale,
    languages
  };
}
export { localeForCountry };
