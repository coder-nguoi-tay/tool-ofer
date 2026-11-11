import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestionText, QUESTION_TYPE_PATTERNS } from "../autofill.mjs";

test('classifyQuestionText: nhận đúng loại câu hỏi §17', () => {
  assert.equal(classifyQuestionText('How old are you?'), 'age_range');
  assert.equal(classifyQuestionText('Select your age range'), 'age_range');
  assert.equal(classifyQuestionText('What type of vehicle do you prefer?'), 'preference');
  assert.equal(classifyQuestionText('What vehicle do you currently drive?'), 'vehicle');
  assert.equal(classifyQuestionText('Mode of transportation used'), 'vehicle');
});

test('classifyQuestionText: không khớp nhầm từ chứa age/car/bus', () => {
  for (const t of ['Page 2 of 5', 'Manage your account', 'Take care of your health', 'Business email', 'Select your state']) {
    assert.equal(classifyQuestionText(t), 'unknown', t);
  }
});

test('QUESTION_TYPE_PATTERNS là chuỗi (truyền được vào frame.evaluate)', () => {
  for (const [, src] of QUESTION_TYPE_PATTERNS) assert.equal(typeof src, 'string');
});

test('matchFieldValue: ô tuổi type=tel maxlength=3 không bị điền bằng SĐT', async () => {
  const { matchFieldValue } = await import("../autofill.mjs");
  const rec = { birthyear: '1992', birthmonth: '04', birthday: '15', phone: '8145551234', zipcode: '99654' };
  const md = { type: 'tel', maxLength: 3, kind: 'input' };
  const v = matchFieldValue(['su-age', 'age', 'Age'], rec, md);
  assert.equal(v, String(new Date().getFullYear() - 1992));
});
