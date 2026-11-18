import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/**
 * Tạo mock DOM element cơ bản.
 * @param {string} id ID element.
 * @param {object} [initProps={}] Thuộc tính khởi tạo.
 * @return {object} Mock element.
 */
function createMockElement(id, initProps = {}) {
  return {
    id,
    checked: false,
    value: '',
    style: {},
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); }
    },
    closest() {
      return {
        classList: this.classList
      };
    },
    ...initProps
  };
}

/**
 * Thiết lập context giả lập môi trường desktop UI.
 * @return {object} VM context chứa toàn bộ các hàm toggle / sync.
 */
function createDesktopUIContext() {
  const store = {};
  const elements = {
    cbxRunInApp: createMockElement('cbxRunInApp', { checked: true }),
    cbxHideUntilTarget: createMockElement('cbxHideUntilTarget', { checked: false }),
    cbxHideUntilLead: createMockElement('cbxHideUntilLead', { checked: false }),
    cbxObscura: createMockElement('cbxObscura', { checked: false }),
    cbxGoLogin: createMockElement('cbxGoLogin', { checked: false }),
    cbxCheckLead: createMockElement('cbxCheckLead', { checked: false }),
    cbxStopAutofillOnLead: createMockElement('cbxStopAutofillOnLead', { checked: false }),
    cbxChoiceDelay: createMockElement('cbxChoiceDelay', { checked: false }),
    cbxChoiceDelayPill: createMockElement('cbxChoiceDelayPill', { checked: false }),
    nudChoiceDelay: createMockElement('nudChoiceDelay', { value: '2' }),
    lblChoiceDelayUnit: createMockElement('lblChoiceDelayUnit', {}),
    cbxAuto: createMockElement('cbxAuto', { value: 'auto' }),
    cbxMultiTab: createMockElement('cbxMultiTab', { checked: true }),
    cbxDataSaver: createMockElement('cbxDataSaver', { checked: true }),
    cbxCheckDuplicateIP: createMockElement('cbxCheckDuplicateIP', { checked: true }),
    lblBrowserChrome: createMockElement('lblBrowserChrome', {}),
    dashBrowserBadge: createMockElement('dashBrowserBadge', {}),
  };

  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => []
    },
    localStorage: {
      getItem: (key) => store[key] ?? null,
      setItem: (key, val) => { store[key] = String(val); },
      removeItem: (key) => { delete store[key]; }
    },
    getLeadCheckSettings: () => ({
      enableLeadCheck: Boolean(elements.cbxCheckLead.checked),
      leadCheckInterval: 30,
      stopAutofillOnLead: Boolean(elements.cbxCheckLead.checked && elements.cbxStopAutofillOnLead.checked)
    }),
    syncOptionPills: () => {},
    window: {}
  });

  // Nạp các hàm vào context
  vm.runInContext(readFileSync('ui/desktop/functions/sync-window-display-mode.js', 'utf8'), context);
  vm.runInContext(readFileSync('ui/desktop/functions/sync-gologin-setting.js', 'utf8'), context);
  vm.runInContext(readFileSync('ui/desktop/functions/select-lead-check-interval.js', 'utf8'), context);
  vm.runInContext(readFileSync('ui/desktop/functions/toggle-stop-autofill-on-lead.js', 'utf8'), context);
  vm.runInContext(readFileSync('ui/desktop/functions/toggle-choice-delay.js', 'utf8'), context);

  return { context, elements, store };
}

test('Chế độ hiển thị cửa sổ: loại trừ tương hỗ giữa RunInApp, HideUntilTarget và HideUntilLead', () => {
  const { context, elements, store } = createDesktopUIContext();

  // 1. Mặc định: RunInApp = true, 2 nút kia false
  assert.equal(elements.cbxRunInApp.checked, true);
  assert.equal(elements.cbxHideUntilTarget.checked, false);
  assert.equal(elements.cbxHideUntilLead.checked, false);

  // 2. Chuyển sang "Ẩn đến trang đích"
  context.syncWindowDisplayMode('hideUntilTarget', true);
  assert.equal(elements.cbxRunInApp.checked, false, 'RunInApp phải tự tắt khi chọn HideUntilTarget');
  assert.equal(elements.cbxHideUntilTarget.checked, true);
  assert.equal(elements.cbxHideUntilLead.checked, false);
  assert.equal(store.autoleadpc_run_in_app, 'false');
  assert.equal(store.autoleadpc_hide_until_target, 'true');

  // 3. Chuyển sang "Chỉ hiện khi có Lead"
  context.syncWindowDisplayMode('hideUntilLead', true);
  assert.equal(elements.cbxRunInApp.checked, false, 'RunInApp phải tắt khi chọn HideUntilLead');
  assert.equal(elements.cbxHideUntilTarget.checked, false, 'HideUntilTarget phải tắt khi chọn HideUntilLead');
  assert.equal(elements.cbxHideUntilLead.checked, true);
  assert.equal(elements.cbxCheckLead.checked, true, 'Chọn HideUntilLead phải tự động kích hoạt Check Lead');
  assert.equal(store.autoleadpc_hide_until_lead, 'true');

  // 4. Quay lại "Chạy trong app"
  context.syncWindowDisplayMode('runInApp', true);
  assert.equal(elements.cbxRunInApp.checked, true);
  assert.equal(elements.cbxHideUntilTarget.checked, false, 'HideUntilTarget phải tắt khi chọn RunInApp');
  assert.equal(elements.cbxHideUntilLead.checked, false, 'HideUntilLead phải tắt khi chọn RunInApp');
  assert.equal(store.autoleadpc_run_in_app, 'true');
  assert.equal(store.autoleadpc_hide_until_target, 'false');
  assert.equal(store.autoleadpc_hide_until_lead, 'false');

  // 5. Tắt cả 3 nút (mở cửa sổ Desktop bình thường)
  context.syncWindowDisplayMode('runInApp', false);
  assert.equal(elements.cbxRunInApp.checked, false);
  assert.equal(elements.cbxHideUntilTarget.checked, false);
  assert.equal(elements.cbxHideUntilLead.checked, false);
  assert.equal(store.autoleadpc_run_in_app, 'false');
});

test('Trình duyệt Obscura V8: bắt buộc chạy trong app và tự tắt khi người dùng chọn mở Desktop', () => {
  const { context, elements } = createDesktopUIContext();

  // Bật GoLogin trước
  context.syncGoLoginSetting(true);
  assert.equal(elements.cbxGoLogin.checked, true);

  // Bật Obscura -> GoLogin phải tắt, RunInApp phải bật, HideUntilTarget & HideUntilLead phải tắt
  context.syncObscuraSetting(true);
  assert.equal(elements.cbxObscura.checked, true);
  assert.equal(elements.cbxGoLogin.checked, false, 'GoLogin phải tự tắt khi bật Obscura');
  assert.equal(elements.cbxRunInApp.checked, true, 'Obscura là headless native nên bắt buộc RunInApp');
  assert.equal(elements.cbxHideUntilTarget.checked, false);
  assert.equal(elements.cbxHideUntilLead.checked, false);

  // Người dùng tick "Ẩn đến trang đích" trong khi Obscura đang bật -> Phải tự tắt Obscura vì Obscura không có cửa sổ Desktop
  context.syncWindowDisplayMode('hideUntilTarget', true);
  assert.equal(elements.cbxObscura.checked, false, 'Obscura phải tự tắt khi người dùng chọn hiển thị Desktop');
  assert.equal(elements.cbxHideUntilTarget.checked, true);
  assert.equal(elements.cbxRunInApp.checked, false);

  // Thử lại: Bật Obscura rồi bỏ tick "Chạy trong app" -> Phải tự tắt Obscura
  context.syncObscuraSetting(true);
  assert.equal(elements.cbxObscura.checked, true);
  assert.equal(elements.cbxRunInApp.checked, true);

  context.syncWindowDisplayMode('runInApp', false);
  assert.equal(elements.cbxObscura.checked, false, 'Obscura phải tự tắt khi bỏ chọn Chạy trong app');
  assert.equal(elements.cbxRunInApp.checked, false);
});

test('Check Lead & Dừng sau lead: ràng buộc logic và tự động bật/tắt liên đới', () => {
  const { context, elements } = createDesktopUIContext();

  // CheckLead đang tắt, tick Dừng sau lead -> phải tự kích hoạt CheckLead 30s
  assert.equal(elements.cbxCheckLead.checked, false);
  context.toggleStopAutofillOnLead(true);
  assert.equal(elements.cbxStopAutofillOnLead.checked, true);
  assert.equal(elements.cbxCheckLead.checked, true, 'Tự động kích hoạt CheckLead 30s khi tick Dừng sau lead');

  // Khi tắt CheckLead -> Dừng sau lead và HideUntilLead phải tự động tắt
  elements.cbxHideUntilLead.checked = true;
  context.selectLeadCheckInterval(30, false);
  assert.equal(elements.cbxCheckLead.checked, false);
  assert.equal(elements.cbxStopAutofillOnLead.checked, false, 'Dừng sau lead phải tự tắt khi bỏ chọn CheckLead');
  assert.equal(elements.cbxHideUntilLead.checked, false, 'HideUntilLead phải tự tắt khi bỏ chọn CheckLead');
});

test('Delay chọn đáp án: đồng bộ 2 nút checkbox và ô nhập số giây', () => {
  const { context, elements, store } = createDesktopUIContext();

  // Bật delay chọn đáp án
  context.toggleChoiceDelay(true);
  assert.equal(elements.cbxChoiceDelay.checked, true);
  assert.equal(elements.cbxChoiceDelayPill.checked, true);
  assert.equal(elements.nudChoiceDelay.style.display, 'inline-block');
  assert.equal(elements.lblChoiceDelayUnit.style.display, 'inline-block');
  assert.equal(store.autoleadpc_enable_choice_delay, 'true');

  // Tắt delay chọn đáp án
  context.toggleChoiceDelay(false);
  assert.equal(elements.cbxChoiceDelay.checked, false);
  assert.equal(elements.cbxChoiceDelayPill.checked, false);
  assert.equal(elements.nudChoiceDelay.style.display, 'none');
  assert.equal(elements.lblChoiceDelayUnit.style.display, 'none');
  assert.equal(store.autoleadpc_enable_choice_delay, 'false');
});
