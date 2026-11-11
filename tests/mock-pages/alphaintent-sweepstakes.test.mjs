import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPrepopulatedDataFromPage, fillAlphaIntentSpecialFields } from "../../autofill.mjs";

test('Alpha Intent / SweepstakesAlerts: extractPrepopulatedDataFromPage extracts sessionData & geolocation', async () => {
  const mockFrameWithGlobal = {
    evaluate: async (fn) => {
      const origGlobal = globalThis.window;
      globalThis.window = {
        globalData: {
          sessionData: {
            email: 'deveshmeet@gmail.com',
            city: 'Clifton',
            zipcode: '07055',
            state: '',
          },
          geolocation: {
            city: 'Passaic',
            state: 'New Jersey',
            stateAbbreviation: 'NJ',
            zipcode: '07055',
          },
        },
      };
      try {
        return await fn();
      } finally {
        globalThis.window = origGlobal;
      }
    },
  };

  const extracted = await extractPrepopulatedDataFromPage(mockFrameWithGlobal);
  assert.equal(extracted.email, 'deveshmeet@gmail.com', 'email extracted from sessionData');
  assert.equal(extracted.city, 'Clifton', 'city extracted from sessionData');
  assert.equal(extracted.zipcode, '07055', 'zipcode extracted from sessionData');
  assert.equal(extracted.state, 'NJ', 'state fallback from geolocation.stateAbbreviation');
});

test('Alpha Intent / SweepstakesAlerts: fillAlphaIntentSpecialFields handles #ai-funnel and syncs hidden inputs', async () => {
  const values = {
    name: '',
    inputFullname: '',
    address: '',
    inputAddress: '',
    date: '',
    inputDob: '',
    phone: '',
    inputPhone: '',
    inputGender: '',
    hasTcpa: '',
  };

  const createMockLocator = (fieldKey, count = 1, isVisible = true) => ({
    count: async () => count,
    isVisible: async () => isVisible,
    isEditable: async () => isVisible,
    isEnabled: async () => true,
    inputValue: async () => values[fieldKey] || '',
    fill: async (val) => { values[fieldKey] = val; },
    press: async () => {},
    check: async () => { values[fieldKey] = 'checked'; },
    isChecked: async () => values[fieldKey] === 'checked',
    evaluate: async (fn) => {
      const el = {
        dataset: {},
        value: values[fieldKey] || '',
        setAttribute: () => {},
      };
      return fn(el);
    },
    first() { return this; },
  });

  const mockFrame = {
    locator: (selector) => {
      if (selector.includes('fullname-input') || selector.includes('#name')) {
        return createMockLocator('name');
      }
      if (selector.includes('ai-input-gender')) {
        return createMockLocator('gender');
      }
      if (selector.includes('disclaimer-container') || selector.includes('tcpa')) {
        return createMockLocator('hasTcpa');
      }
      if (selector.includes('address-input') || selector.includes('#address')) {
        return createMockLocator('address');
      }
      if (selector.includes('dob-input') || selector.includes('#date')) {
        return createMockLocator('date');
      }
      if (selector.includes('phone-input') || selector.includes('#phone')) {
        return createMockLocator('phone');
      }
      if (selector.includes('button-save-phone')) {
        return { count: async () => 0 };
      }
      return { count: async () => 0, first() { return this; } };
    },
    evaluate: async (fn, arg) => {
      // Giả lập document.getElementById cho các hidden inputs
      const origDoc = globalThis.document;
      globalThis.document = {
        getElementById: (id) => {
          if (id === 'input-fullname') return { readOnly: true, set value(v) { values.inputFullname = v; }, get value() { return values.inputFullname; }, dispatchEvent: () => {} };
          if (id === 'input-gender') return { readOnly: true, set value(v) { values.inputGender = v; }, get value() { return values.inputGender; }, dispatchEvent: () => {} };
          if (id === 'input-address') return { readOnly: true, set value(v) { values.inputAddress = v; }, get value() { return values.inputAddress; }, dispatchEvent: () => {} };
          if (id === 'input-dob') return { readOnly: true, set value(v) { values.inputDob = v; }, get value() { return values.inputDob; }, dispatchEvent: () => {} };
          if (id === 'input-phone') return { readOnly: true, set value(v) { values.inputPhone = v; }, get value() { return values.inputPhone; }, dispatchEvent: () => {} };
          if (id === 'has_tcpa_optin') return { set value(v) { values.hasTcpa = v; }, get value() { return values.hasTcpa; }, setAttribute: () => {} };
          if (id === 'name') return { value: values.name };
          if (id === 'address') return { value: values.address };
          if (id === 'date') return { value: values.date };
          if (id === 'phone') return { value: values.phone };
          return null;
        },
      };
      try {
        return await fn(arg);
      } finally {
        globalThis.document = origDoc;
      }
    },
  };

  const record = {
    firstname: 'Devesh',
    lastname: 'Meet',
    address: '123 Main St',
    dob: '1990-08-15',
    phone: '2015550144',
    gender: 'M',
    city: 'Clifton',
    state: 'NJ',
    zipcode: '07055',
  };

  const filledCount = await fillAlphaIntentSpecialFields(mockFrame, record);
  assert.ok(filledCount > 0, 'Special fields are filled and synced');
  assert.equal(values.name, 'Devesh Meet', 'full name filled');
  assert.equal(values.inputFullname, 'Devesh Meet', 'hidden input-fullname synced');
  assert.equal(values.inputGender, 'MALE', 'hidden input-gender synced');
  assert.equal(values.address, '123 Main St', 'address filled');
  assert.equal(values.inputAddress, '123 Main St', 'hidden input-address synced');
  assert.equal(values.date, '08/15/1990', 'date of birth formatted MM/DD/YYYY');
  assert.equal(values.inputDob, '08/15/1990', 'hidden input-dob synced');
  assert.match(values.phone, /^\((814|817)\) \d{3}-\d{4}$/, 'phone formatted (XXX) XXX-XXXX');
  assert.equal(values.inputPhone, values.phone, 'hidden input-phone synced');
});
