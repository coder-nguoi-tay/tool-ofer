import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFieldValue } from '../src/autofill/match-field-value.mjs';

// Record dạng tách: birthday = NGÀY trong tháng (log 2026-11-12 selectmypolicy: điền "13" vào ô MM/DD/YYYY).
const split = { birthmonth: '9', birthday: '13', birthyear: '1988', firstname: 'Lisa' };

test('ô "birthday" MM/DD/YYYY với record tách tháng/ngày/năm → ngày sinh đầy đủ, không phải "13"', () => {
  assert.equal(matchFieldValue(['birthday', 'mm/dd/yyyy'], split, { type: 'text', name: 'birthday', id: 'birthday' }), '09/13/1988');
  assert.equal(matchFieldValue(['birthday'], split, { type: 'date', name: 'birthday' }), '1988-09-13');
});

test('ô "birthday" 2 ký tự (ô ngày riêng) vẫn nhận ngày trong tháng', () => {
  assert.equal(matchFieldValue(['birthday'], split, { type: 'text', name: 'birthday', maxLength: 2 }), '13');
});

test('record có birthday là ngày đầy đủ vẫn giữ hành vi cũ', () => {
  assert.equal(matchFieldValue(['birthday'], { birthday: '09/13/1988' }, { type: 'text', name: 'birthday' }), '09/13/1988');
});
