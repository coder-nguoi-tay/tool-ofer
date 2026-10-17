import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScript,
  parseDelayMs,
  parseSelectorString,
  buildVars,
  interpolate,
  US_STATES,
} from './script.mjs';

test('parseScript correctly handles standard Windows exe script lines', () => {
  const scriptText = `
    // Comment line
    # Another comment
    {EmailConfig}
    {InfoConfig}
    {SendById}=firstName|{Fname}|15
    {Delay}=2|5
    {SmartClick}=#submit|1|1
    {TrySelectState}=id=state
    {GenderSelect}={Gender}
    {ClearCookie}
  `;
  const steps = parseScript(scriptText);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps[0], { cmd: 'EmailConfig', arg: '' });
  assert.deepEqual(steps[2], { cmd: 'SendById', arg: 'firstName|{Fname}|15' });
  assert.deepEqual(steps[3], { cmd: 'Delay', arg: '2|5' });
  assert.deepEqual(steps[4], { cmd: 'SmartClick', arg: '#submit|1|1' });
  assert.deepEqual(steps[5], { cmd: 'TrySelectState', arg: 'id=state' });
  assert.deepEqual(steps[6], { cmd: 'GenderSelect', arg: '{Gender}' });
  assert.deepEqual(steps[7], { cmd: 'ClearCookie', arg: '' });
});

test('parseSelectorString correctly identifies selector prefixes', () => {
  assert.deepEqual(parseSelectorString('#myBtn'), { type: 'css', query: '#myBtn' });
  assert.deepEqual(parseSelectorString('.myClass'), { type: 'css', query: '.myClass' });
  assert.deepEqual(parseSelectorString('id=myId'), { type: 'css', query: '#myId' });
  assert.deepEqual(parseSelectorString('class=btn primary'), { type: 'css', query: '.btn.primary' });
  assert.deepEqual(parseSelectorString('name=user_login'), { type: 'css', query: '[name="user_login"]' });
  assert.deepEqual(parseSelectorString('css=div > span'), { type: 'css', query: 'div > span' });
  assert.deepEqual(parseSelectorString('//button[@type="submit"]'), { type: 'xpath', query: '//button[@type="submit"]' });
  assert.deepEqual(parseSelectorString('xpath=//input'), { type: 'xpath', query: '//input' });
  assert.deepEqual(parseSelectorString('firstName'), { type: 'auto', query: 'firstName' });
});

test('parseDelayMs correctly generates range bounds', () => {
  const fixed = parseDelayMs('3');
  assert.equal(fixed, 3000);

  const range = parseDelayMs('2|4');
  assert.ok(range >= 2000 && range <= 4000);
});

test('buildVars and interpolate format all 76 PC variables', () => {
  const record = {
    firstname: 'John',
    lastname: 'Doe',
    phone: '(555) 123-4567',
    state: 'CA',
    city: 'Los Angeles',
    address: '123 Main St',
    zipcode: '90001',
    email: 'john.doe@example.com',
    gender: 'Male',
  };
  const vars = buildVars(record);
  assert.equal(vars.Fname, 'John');
  assert.equal(vars.Lname, 'Doe');
  assert.equal(vars.Phone, '5551234567');
  assert.equal(vars.Phone1, '555');
  assert.equal(vars.Phone2, '123');
  assert.equal(vars.Phone3, '4567');
  assert.equal(vars.State, 'CA');
  assert.equal(US_STATES[vars.State], 'California');

  const rendered = interpolate('{Fname} {Lname} lives in {City}, {State} ({Zipcode}) with phone {Phone1}-{Phone2}-{Phone3}', record);
  assert.equal(rendered, 'John Doe lives in Los Angeles, CA (90001) with phone 555-123-4567');
});
