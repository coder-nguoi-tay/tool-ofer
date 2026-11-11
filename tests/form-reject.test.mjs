import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rotateRejectedFormData, MAX_REJECT_ROTATIONS } from "../autofill.mjs";

const frame = { evaluate: async () => {} };
const emailErr = { hasError: true, firstError: 'Please check this field', fieldName: 'email', fieldType: 'email', fieldValue: 'old@gmail.com' };

test('trang báo email invalid → đổi email ngay lần đầu', async () => {
  const record = { email: 'old@gmail.com' };
  const session = { emailFilled: true };
  const options = { onFormRejected: async () => ({ email: 'next@gmail.com' }) };
  const err = { hasError: true, firstError: 'Email address invalid', fieldName: 'email', fieldType: 'email', fieldValue: 'old@gmail.com' };
  assert.equal(await rotateRejectedFormData(frame, record, session, options, err), true);
  assert.equal(record.email, 'next@gmail.com');
});

test('email bị báo lỗi không rõ ràng 2 lần → xin email mới, cập nhật record và reset cờ email', async () => {
  const calls = [];
  const record = { firstname: 'Kim', email: 'old@gmail.com', assignedEmail: 'old@gmail.com' };
  const session = { emailFilled: true, emailScreenSubmitted: true, assignedEmail: 'old@gmail.com' };
  const options = { onFormRejected: async (s, info) => { calls.push(info.kind); return { email: 'new@gmail.com' }; }, onLog: () => {} };
  assert.equal(await rotateRejectedFormData(frame, record, session, options, emailErr), false, 'lần đầu cho thử lại');
  assert.equal(await rotateRejectedFormData(frame, record, session, options, emailErr), true);
  assert.deepEqual(calls, ['email']);
  assert.equal(record.email, 'new@gmail.com');
  assert.equal(record.assignedEmail, 'new@gmail.com');
  assert.equal(record.firstname, 'Kim');
  assert.equal(session.emailFilled, false);
  assert.equal(session.emailScreenSubmitted, false);
});

test('ô khác bị từ chối → đổi record nhưng giữ email', async () => {
  const record = { firstname: 'Bad#Name', email: 'keep@gmail.com' };
  const session = {};
  const options = { onFormRejected: async () => ({ firstname: 'Ann', zipcode: '10001' }) };
  const err = { hasError: true, firstError: 'Special characters are not permitted', fieldName: 'input_159', fieldValue: 'Bad#Name' };
  await rotateRejectedFormData(frame, record, session, options, err);
  assert.equal(await rotateRejectedFormData(frame, record, session, options, err), true);
  assert.deepEqual(record, { firstname: 'Ann', zipcode: '10001', email: 'keep@gmail.com' });
});

test('ô trống báo required không tính là bị từ chối; có giới hạn số lần đổi', async () => {
  const options = { onFormRejected: async () => ({ email: 'x@gmail.com' }) };
  const empty = { hasError: true, firstError: 'This field is required', fieldName: 'zip', fieldValue: '' };
  const s1 = {};
  assert.equal(await rotateRejectedFormData(frame, {}, s1, options, empty), false);
  assert.equal(await rotateRejectedFormData(frame, {}, s1, options, empty), false);
  const s2 = { emailFilled: true, _rejectRotations: MAX_REJECT_ROTATIONS };
  await rotateRejectedFormData(frame, {}, s2, options, emailErr);
  assert.equal(await rotateRejectedFormData(frame, {}, s2, options, emailErr), false, 'quá giới hạn thì không đổi nữa');
});
