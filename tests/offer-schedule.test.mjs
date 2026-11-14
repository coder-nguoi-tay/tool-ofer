import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function createSchedulerContext() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        checked: false,
        value: '',
        style: { display: 'none' },
        classList: {
          add(c) { this[c] = true; },
          remove(c) { delete this[c]; }
        },
        disabled: false,
        textContent: '',
        innerHTML: ''
      });
    }
    return elements.get(id);
  };

  const context = vm.createContext({
    window: {
      _activeOfferScheduleTimer: null,
      _activeOfferSchedules: []
    },
    document: {
      getElementById: getElement
    },
    console: { log() {}, warn() {}, error() {} },
    Date: globalThis.Date,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    parseInt: globalThis.parseInt,
    Math: globalThis.Math,
    String: globalThis.String,
    Array: globalThis.Array
  });

  const files = [
    'toggle-schedule-offer.js',
    'get-offer-schedule-settings.js',
    'offer-scheduler.js'
  ];

  for (const f of files) {
    const code = readFileSync(new URL(`../ui/desktop/functions/${f}`, import.meta.url), 'utf8');
    vm.runInContext(code, context);
  }

  return { context, getElement };
}

test('toggleScheduleOffer ẩn hiện ô chọn giờ cho từng offer', () => {
  const { context, getElement } = createSchedulerContext();

  context.toggleScheduleOffer(1, true);
  const time1 = getElement('timeScheduleOffer1');
  assert.equal(time1.style.display, 'inline-block');
  assert.equal(time1.value, '07:00');

  context.toggleScheduleOffer(1, false);
  assert.equal(time1.style.display, 'none');

  context.toggleScheduleOffer(2, true);
  const time2 = getElement('timeScheduleOffer2');
  assert.equal(time2.style.display, 'inline-block');
  assert.equal(time2.value, '08:00');
});

test('getOfferScheduleSettings đọc đúng cấu hình hẹn giờ của cả 4 offer', () => {
  const { context, getElement } = createSchedulerContext();

  getElement('cbxScheduleOffer1').checked = true;
  getElement('timeScheduleOffer1').value = '07:30';

  getElement('cbxScheduleOffer2').checked = true;
  getElement('timeScheduleOffer2').value = '08:15';

  const settings = context.getOfferScheduleSettings();
  assert.equal(settings.length, 4);

  assert.equal(settings[0].offerIndex, 1);
  assert.equal(settings[0].enabled, true);
  assert.equal(settings[0].time, '07:30');

  assert.equal(settings[1].offerIndex, 2);
  assert.equal(settings[1].enabled, true);
  assert.equal(settings[1].time, '08:15');

  assert.equal(settings[2].offerIndex, 3);
  assert.equal(settings[2].enabled, false);
  assert.equal(settings[2].time, '12:00');
});

test('startOfferScheduler kích hoạt đếm ngược và hủy hẹn giờ chính xác', async () => {
  const { context, getElement } = createSchedulerContext();

  const executedOffers = [];
  const fakeSchedules = [
    { offerIndex: 1, enabled: true, time: '07:00' },
    { offerIndex: 2, enabled: true, time: '08:00' }
  ];

  const started = context.startOfferScheduler(fakeSchedules, item => {
    executedOffers.push(item);
  });

  assert.equal(started, true);
  assert.equal(getElement('offerScheduleBanner').style.display, 'flex');
  assert.ok(context.window._activeOfferScheduleTimer !== null);

  // Hủy hẹn giờ
  context.cancelOfferSchedule();
  assert.equal(context.window._activeOfferScheduleTimer, null);
  assert.equal(getElement('offerScheduleBanner').style.display, 'none');
  assert.equal(getElement('btnStart').textContent, '▶ Start');
});
