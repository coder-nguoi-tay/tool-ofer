/**
 * Đọc phần địa chỉ của một yêu cầu SOCKS5 theo ATYP.
 *
 * @param {object} reader Bộ đọc socket.
 * @param {number} addressType Giá trị ATYP.
 * @return {Promise<Buffer>} Byte địa chỉ kèm port.
 * @throws {Error} Khi ATYP không hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function readAddress(reader, addressType) {
  if (addressType === 0x01) return reader.read(4 + 2);
  if (addressType === 0x04) return reader.read(16 + 2);
  if (addressType === 0x03) {
    const length = await reader.read(1);
    return Buffer.concat([length, await reader.read(length[0] + 2)]);
  }
  throw new Error(`ATYP không hỗ trợ: ${addressType}`);
}
export { readAddress };
