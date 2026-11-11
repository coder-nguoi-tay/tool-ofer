import { buildBrandLists } from './build-brand-lists.mjs';
import { chromeBrandForChannel } from './chrome-brand-for-channel.mjs';

/**
 * Tham số Emulation.setUserAgentOverride đầy đủ: UA, Client Hints, navigator.platform, ngôn ngữ.
 *
 * @param {object} deviceProfile Một phần tử của DEVICE_PROFILES.
 * @param {{version: string, channel?: string}} build Bản Chrome đang chạy.
 * @param {string[]} languages Danh sách ngôn ngữ (không kèm q=, Chrome tự thêm vào header).
 * @return {object} Tham số CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildUserAgentOverride(deviceProfile, build, languages) {
  const params = {
    userAgent: deviceProfile.ua(build.version),
    acceptLanguage: languages.join(','),
    platform: deviceProfile.spoof.platform
  };
  // Chrome trên iOS là WebKit: không có Client Hints, phần đó do init script xoá.
  if (deviceProfile.uaData) {
    const {
      brands,
      fullVersionList
    } = buildBrandLists(build.version, chromeBrandForChannel(build.channel));
    params.userAgentMetadata = {
      brands,
      fullVersionList,
      fullVersion: build.version,
      platform: deviceProfile.uaData.platform,
      platformVersion: deviceProfile.uaData.platformVersion,
      architecture: deviceProfile.uaData.architecture,
      model: deviceProfile.uaData.model ?? '',
      mobile: Boolean(deviceProfile.spoof.mobile),
      bitness: deviceProfile.uaData.bitness ?? '',
      wow64: false
    };
  }
  return params;
}
export { buildUserAgentOverride };
