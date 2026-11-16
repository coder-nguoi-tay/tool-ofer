import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { scheduleAutoStop, getAutoStopSchedule, cancelAutoStop } from '../src/runtime/auto-stop-scheduler.mjs';
import { closeActiveBrowsers } from '../src/browser/actions/close-active-browsers.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

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
      _activeOfferSchedules: [],
      _activeStopScheduleTimer: null,
      _activeStopSchedule: null
    },
    localStorage: {
      _data: {},
      setItem(k, v) { this._data[k] = v; },
      getItem(k) { return this._data[k] || null; }
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
    Array: globalThis.Array,
    JSON: globalThis.JSON,
    Boolean: globalThis.Boolean
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

test('toggleScheduleStop và getScheduleStopSettings hoạt động chính xác', () => {
  const { context, getElement } = createSchedulerContext();

  // Mặc định ban đầu chưa bật
  const initial = context.getScheduleStopSettings();
  assert.equal(initial.enabled, false);
  assert.equal(initial.time, '23:00');

  // Bật hẹn giờ tắt
  context.toggleScheduleStop(true);
  const timeInput = getElement('timeScheduleStop');
  const hint = getElement('lblScheduleStopHint');
  assert.equal(timeInput.style.display, 'inline-block');
  assert.equal(timeInput.value, '23:00');
  assert.equal(hint.style.display, 'inline');

  // Thay đổi giờ sang 02:30
  getElement('cbxScheduleStop').checked = true;
  timeInput.value = '02:30';

  const updated = context.getScheduleStopSettings();
  assert.equal(updated.enabled, true);
  assert.equal(updated.time, '02:30');

  // Tắt hẹn giờ tắt
  context.toggleScheduleStop(false);
  assert.equal(timeInput.style.display, 'none');
  assert.equal(hint.style.display, 'none');
});

test('startStopScheduler hiển thị đếm ngược và hủy hẹn tắt chính xác', async () => {
  const { context, getElement } = createSchedulerContext();

  let stopped = false;
  const started = context.startStopScheduler({ enabled: true, time: '23:00' }, () => {
    stopped = true;
  });

  assert.equal(started, true);
  assert.ok(context.window._activeStopScheduleTimer !== null);
  assert.ok(context.window._activeStopSchedule !== null);
  assert.equal(getElement('offerScheduleBanner').style.display, 'flex');
  assert.ok(getElement('offerScheduleBannerText').innerHTML.includes('23:00'));

  // Hủy hẹn tắt
  context.cancelStopScheduler();
  assert.equal(context.window._activeStopScheduleTimer, null);
  assert.equal(context.window._activeStopSchedule, null);
  assert.equal(getElement('offerScheduleBanner').style.display, 'none');
  assert.equal(stopped, false);
});

test('backend scheduleAutoStop, getAutoStopSchedule và cancelAutoStop hoạt động chính xác', () => {
  cancelAutoStop();
  assert.equal(getAutoStopSchedule(), null);

  const sched = scheduleAutoStop('23:00', () => {});
  assert.ok(sched !== null);
  assert.equal(sched.time, '23:00');
  assert.ok(sched.targetTimestamp > Date.now() - 30000);

  const current = getAutoStopSchedule();
  assert.equal(current?.time, '23:00');

  cancelAutoStop();
  assert.equal(getAutoStopSchedule(), null);
});

test('hẹn giờ tắt với logic bảo vệ IP lead: chỉ tắt các IP chưa có lead, giữ IP có lead làm nốt và không tự bù slot', async () => {
  activeBrowsers.clear();
  autoRefill.enabled = true;
  autoRefill.stopRequested = false;
  autoRefill.targetCount = 2;

  let nonLeadBrowserClosed = false;
  let leadBrowserClosed = false;

  const sessionNonLead = {
    slot: 1,
    exitIp: '1.2.3.4',
    isClosed: false,
    suppressAutoRefill: false,
    leadCheckStatus: 'none',
    browser: {
      close: async () => { nonLeadBrowserClosed = true; }
    }
  };

  const sessionWithLead = {
    slot: 2,
    exitIp: '5.6.7.8',
    confirmedLeadIp: '5.6.7.8',
    isClosed: false,
    suppressAutoRefill: false,
    leadCheckStatus: 'confirmed',
    browser: {
      close: async () => { leadBrowserClosed = true; }
    }
  };

  activeBrowsers.add(sessionNonLead);
  activeBrowsers.add(sessionWithLead);

  // Kích hoạt dừng theo hẹn giờ với cờ preserveLeadSessions
  const result = await closeActiveBrowsers({ preserveLeadSessions: true });

  // 1. Tự bù phải bị tắt hoàn toàn
  assert.equal(autoRefill.enabled, false);
  assert.equal(autoRefill.stopRequested, true);
  assert.equal(autoRefill.targetCount, 0);

  // 2. Phiên chưa có lead bị đóng ngay lập tức
  assert.equal(sessionNonLead.isClosed, true);
  assert.equal(sessionNonLead.suppressAutoRefill, true);
  assert.equal(nonLeadBrowserClosed, true);
  assert.equal(activeBrowsers.has(sessionNonLead), false);

  // 3. Phiên CÓ LEAD được giữ lại, không bị đóng
  assert.equal(sessionWithLead.isClosed, false);
  assert.equal(sessionWithLead.suppressAutoRefill, true);
  assert.equal(sessionWithLead._autoStopLeadPending, true);
  assert.equal(leadBrowserClosed, false);
  assert.equal(activeBrowsers.has(sessionWithLead), true);

  // 4. Báo cáo kết quả
  assert.equal(result.closedCount, 1);
  assert.equal(result.leadSessionsKeptCount, 1);

  // 5. Sau khi phiên có lead làm xong tự đóng: không được bù slot
  sessionWithLead.isClosed = true;
  activeBrowsers.delete(sessionWithLead);
  await sessionWithLead.browser.close();
  assert.equal(leadBrowserClosed, true);
  assert.equal(autoRefill.enabled, false);
  assert.equal(autoRefill.stopRequested, true);
  assert.equal(activeBrowsers.size, 0);
});
