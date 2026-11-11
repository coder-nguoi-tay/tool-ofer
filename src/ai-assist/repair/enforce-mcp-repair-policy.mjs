/**
 * Giới hạn công cụ MCP của lượt repair: chỉ đọc, gõ/chọn dữ liệu cung cấp; cấm click, Enter và điều hướng.
 * @param {string} toolName Tên công cụ MCP được gọi.
 * @param {object} parameters Tham số đã parse của tool.
 * @param {string[]} allowedValues Các giá trị và alias hợp lệ từ record.
 * @return {void} Chuẩn hóa submit=false cho typing khi được phép.
 * @throws {Error} Khi tool hoặc giá trị vượt quyền repair.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function enforceMcpRepairPolicy(toolName, parameters, allowedValues) {
  if (['browser_snapshot','browser_wait_for','browser_console_messages','browser_network_requests'].includes(toolName)) return;
  if (!['browser_type','browser_select_option'].includes(toolName)) throw new Error('Repair không được click, submit hoặc điều hướng; autofill phụ trách bước này.');
  const values = toolName === 'browser_type' ? [parameters.text] : parameters.values || [];
  if (!values.length || values.some(value => !allowedValues.includes(String(value)))) throw new Error('missing_record: giá trị repair không thuộc dữ liệu được cung cấp.');
  if (toolName === 'browser_type' && /[\r\n]/.test(parameters.text)) throw new Error('Repair không được gửi Enter qua nội dung typing.');
  if (toolName === 'browser_type') parameters.submit = false;
}
