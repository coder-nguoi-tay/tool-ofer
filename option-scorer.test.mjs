import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOption, rankOptions, buildOptionDecision, OPTION_SCORE_THRESHOLDS } from './option-scorer.mjs';
import { chooseSemanticAnswer } from './autofill.mjs';

const good = { visible: true, enabled: true, sameBlock: true, nearQuestion: true, role: 'button', hasLabel: true };

test('scoreOption: option chuẩn vượt ngưỡng click, option ẩn/noise bị loại', () => {
  assert.ok(scoreOption(good) >= OPTION_SCORE_THRESHOLDS.CLICK);
  assert.ok(scoreOption({ ...good, hidden: true }) < OPTION_SCORE_THRESHOLDS.FALLBACK);
  assert.ok(scoreOption({ ...good, enabled: false }) < OPTION_SCORE_THRESHOLDS.FALLBACK);
  assert.ok(scoreOption({ ...good, noise: true }) < scoreOption(good) - 50);
  assert.ok(scoreOption({ ...good, nearQuestion: false, role: 'link' }) < scoreOption(good));
});

test('rankOptions + buildOptionDecision: tier và log chuẩn §16.3', () => {
  const ranked = rankOptions([
    { uid: 'a', label: '18-24', features: good },
    { uid: 'b', label: 'privacy', features: { ...good, noise: true, nearQuestion: false } },
    { uid: 'c', label: '25-34', features: { ...good, hidden: true } },
  ]);
  assert.deepEqual(ranked.map((r) => r.tier), ['click', 'skip', 'skip']);
  const d = buildOptionDecision({ questionText: 'How old are you?', ranked, selected: ranked[0], verified: true });
  assert.equal(d.candidateCount, 3);
  assert.equal(d.selectedCandidateText, '18-24');
  assert.equal(d.ambiguous, false);
  assert.equal(buildOptionDecision({ ranked }).ambiguous, true);
});

test('chooseSemanticAnswer: theo record, block-score và fallback đầu tiên', () => {
  const ages = ['18-24', '25-34', '35-44', '65+'];
  assert.deepEqual(chooseSemanticAnswer('age_range', ages, {}, 31), { index: 1, confidence: 'record' });
  assert.deepEqual(chooseSemanticAnswer('age_range', ages, {}, 70), { index: 3, confidence: 'record' });
  assert.deepEqual(chooseSemanticAnswer('age_range', ages, {}, null), { index: 1, confidence: 'block_score' });
  const cars = ['i do not drive', 'sedan', 'suv', 'car'];
  assert.deepEqual(chooseSemanticAnswer('vehicle', cars, { vehicle_type: 'SUV' }), { index: 2, confidence: 'record' });
  assert.deepEqual(chooseSemanticAnswer('vehicle', cars, {}), { index: 3, confidence: 'block_score' });
  assert.deepEqual(chooseSemanticAnswer('preference', ['none of the above', 'blue', 'red'], {}), { index: 1, confidence: 'first_answer' });
  assert.equal(chooseSemanticAnswer('vehicle', [], {}), null);
});
