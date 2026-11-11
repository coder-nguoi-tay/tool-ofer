/**
 * Bộ header Client Hints khớp đúng userAgentMetadata (cùng giá trị JS getHighEntropyValues trả về).
 * Arch/Bitness rỗng (Android) phải giữ rỗng, không tự điền "x86"/"64".
 *
 * @param {object} metadata userAgentMetadata của Emulation.setUserAgentOverride
 * @param {Record<string, string>} [extra] Header ưu tiên ghi đè (clientHintHeaders của phiên)
 * @return {Record<string, string>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function buildClientHintHeaders(metadata, extra = {}) {
  const secChUa = metadata.brands?.map(b => `"${b.brand}";v="${b.version}"`).join(', ') || '';
  return {
    ...(secChUa ? {
      'Sec-CH-UA': secChUa
    } : {}),
    'Sec-CH-UA-Platform': `"${metadata.platform}"`,
    'Sec-CH-UA-Platform-Version': `"${metadata.platformVersion || (metadata.platform === 'Windows' ? '10.0.0' : '')}"`,
    'Sec-CH-UA-Mobile': metadata.mobile ? '?1' : '?0',
    'Sec-CH-UA-Model': `"${metadata.model ?? ''}"`,
    'Sec-CH-UA-Arch': `"${metadata.architecture ?? ''}"`,
    'Sec-CH-UA-Bitness': `"${metadata.bitness ?? ''}"`,
    'Sec-CH-UA-WoW64': '?0',
    ...(extra || {})
  };
}
export { buildClientHintHeaders };
