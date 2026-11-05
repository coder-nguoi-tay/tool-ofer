import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFieldValue } from '../autofill.mjs';

test('matchFieldValue: Street Address, Zip Code, City never match phone even if disclaimer has phone text', () => {
  const record = {
    firstname: 'Donald',
    lastname: 'Trump',
    address: '1100 S Ocean Blvd',
    city: 'Palm Beach',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'donald.trump8821@gmail.com',
  };

  const tcpaNoise = 'By providing your phone number and clicking Continue you agree to receive SMS and telemarketing calls at the mobile phone number provided.';

  // 1. Street Address field
  const addressCandidates = ['Street Address', 'address', tcpaNoise];
  const matchedAddress = matchFieldValue(addressCandidates, record, { type: 'text', name: 'address', id: 'address' });
  assert.equal(matchedAddress, '1100 S Ocean Blvd', 'Street Address must match address, NOT phone');

  // 2. Zip Code field
  const zipCandidates = ['Zip Code', 'zip', 'postal', tcpaNoise];
  const matchedZip = matchFieldValue(zipCandidates, record, { type: 'text', name: 'zip', id: 'zip' });
  assert.equal(matchedZip, '33480', 'Zip Code must match zipcode, NOT phone');

  // 3. City / Town field
  const cityCandidates = ['City / Town', 'city', tcpaNoise];
  const matchedCity = matchFieldValue(cityCandidates, record, { type: 'text', name: 'city', id: 'city' });
  assert.equal(matchedCity, 'Palm Beach', 'City must match city, NOT phone');

  // 4. State field
  const stateCandidates = ['State', 'state', tcpaNoise];
  const matchedState = matchFieldValue(stateCandidates, record, { type: 'text', name: 'state', id: 'state' });
  assert.equal(matchedState, 'FL', 'State must match state, NOT phone');

  // 5. Phone field (phải khớp đúng số điện thoại)
  const phoneCandidates = ['Phone Number', 'phone', tcpaNoise];
  const matchedPhone = matchFieldValue(phoneCandidates, record, { type: 'tel', name: 'phone', id: 'phone' });
  assert.equal(matchedPhone, '8145551234', 'Phone field must match phone');
});
