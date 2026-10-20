import test from 'node:test';
import assert from 'node:assert/strict';
import { runAiAssist, inspectAndFixFormWithAi, setGlobalAiConfig, pageHasWork, detectSmartFallbackAction } from './ai-assist.mjs';

test('Multi-Tab AI: runAiAssist chạy độc lập trên nhiều tab mà không chặn nhau', async () => {
  setGlobalAiConfig({ enabled: true, mode: 'fallback_heuristic' });

  const session = {
    tileIndex: 0,
    slot: 1,
    exitIp: '1.2.3.4',
    updateBadge: () => {},
    addLog: () => {},
  };

  const createMockPage = (url, tabIndex) => ({
    _tabIndex: tabIndex,
    url: () => url,
    isClosed: () => false,
    waitForLoadState: async () => {},
    evaluate: async () => ({
      hasErrors: false,
      errors: [],
      unfilledRequired: [],
      hasThankYouText: true,
      hasThankYouUrl: true,
    }),
  });

  const page1 = createMockPage('https://offer1.com/step1', 0);
  const page2 = createMockPage('https://offer2.com/step1', 1);

  // Chạy đồng thời AI Assist trên 2 tab
  const p1Promise = runAiAssist(page1, { firstname: 'John', lastname: 'Doe' }, session);
  const p2Promise = runAiAssist(page2, { firstname: 'Jane', lastname: 'Smith' }, session);

  // Cả hai tab đều phải được kích hoạt AI mà không bị reject
  assert.equal(page1._aiAssistRunning, true, 'Tab 1 phải đang chạy AI');
  assert.equal(page2._aiAssistRunning, true, 'Tab 2 phải đang chạy AI đồng thời');
  assert.equal(session.aiRunningPages.size, 2, 'Session phải ghi nhận cả 2 tabs đang chạy AI');

  await Promise.all([p1Promise, p2Promise]);

  assert.equal(page1._aiAssistRunning, false, 'Tab 1 kết thúc AI');
  assert.equal(page2._aiAssistRunning, false, 'Tab 2 kết thúc AI');
  assert.equal(session.aiAssistRunning, false, 'Session kết thúc toàn bộ AI');
});

test('Multi-Tab AI: inspectAndFixFormWithAi chạy độc lập trên từng tab', async () => {
  setGlobalAiConfig({ enabled: true, mode: 'fallback_heuristic' });

  const session = {
    tileIndex: 0,
    slot: 1,
    exitIp: '1.2.3.4',
    updateBadge: () => {},
    addLog: () => {},
  };

  const createMockPage = (url, tabIndex) => ({
    _tabIndex: tabIndex,
    url: () => url,
    isClosed: () => false,
    evaluate: async () => ({
      hasErrors: false,
      errors: [],
      unfilledRequired: [],
    }),
  });

  const page1 = createMockPage('https://offer1.com/form', 0);
  const page2 = createMockPage('https://offer2.com/form', 1);

  const [res1, res2] = await Promise.all([
    inspectAndFixFormWithAi(page1, { firstname: 'John' }, session),
    inspectAndFixFormWithAi(page2, { firstname: 'Jane' }, session),
  ]);

  // Không tab nào bị 'in_progress' do xung đột với tab kia
  assert.notEqual(res1.status, 'in_progress', 'Tab 1 không được bị lock in_progress');
  assert.notEqual(res2.status, 'in_progress', 'Tab 2 không được bị lock in_progress');
});

test('AI Assist & Form Detection nhận diện form div, class input, btn-option khi không có thẻ form', async () => {
  // Giả lập trang hoàn toàn không có thẻ form, chỉ có div chứa input và nút div.btn-option
  const mockPageNoForm = {
    isClosed: () => false,
    evaluate: async () => true, // Giả lập DOM trả về có input/btn-option chưa điền
  };

  const hasWork = await pageHasWork(mockPageNoForm);
  assert.equal(hasWork, true, 'Phải nhận diện còn việc cần làm trên form dạng div/btn-option');
});
