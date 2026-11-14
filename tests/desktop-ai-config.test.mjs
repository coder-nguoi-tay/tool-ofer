import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

/**
 * Nạp cấu hình AI vào giao diện chính trên DOM giả.
 * @param {object} config Cấu hình server trả về.
 * @return {Promise<object>} Ô timeout sau khi nạp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function loadTimeout(config) {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { getElementById: getElement }, api: async () => config });
  vm.runInContext(readFileSync(new URL('../ui/desktop/functions/load-ai-config-ui.js', import.meta.url), 'utf8'), context);
  await context.loadAiConfigUi();
  return getElement('nudAiTimeout').value;
}

test('ô timeout AI hiện đúng giá trị đã lưu, không bị chặn ở 15 giây (lưu lại sẽ hạ timeout thật)', async () => {
  assert.equal(await loadTimeout({ mode: 'auto_on_stuck', timeoutSeconds: 150 }), 150);
  assert.equal(await loadTimeout({ mode: 'auto_on_stuck' }), 100, 'thiếu giá trị thì dùng mặc định 100 như server');
});
