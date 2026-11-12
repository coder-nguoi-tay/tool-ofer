import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { isFinancialhelpThankyouUrl } from '../src/leads/actions/is-financialhelp-thankyou-url.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { captureLeadWatcherTicks, createLeadTestSession } from './helpers/lead-session-fixture.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; });

test('paththankyou của blog.financialhelpfinder.com là trang thankyou của luồng financialhelp', () => {
  assert.equal(isFinancialhelpThankyouUrl('https://blog.financialhelpfinder.com/paththankyou.php'), true);
  assert.equal(isFinancialhelpThankyouUrl('https://blog.financialhelpfinder.com/paththankyou.php?s=1'), true);
  for (const url of ['http://blog.financialhelpfinder.com/paththankyou.php', 'https://blog.financialhelpfinder.com/path1c.php', 'https://blog.financialhelpfinder.com.evil.test/paththankyou.php', 'https://evil.test/blog.financialhelpfinder.com/paththankyou.php']) {
    assert.equal(isFinancialhelpThankyouUrl(url), false, url);
  }
});

test('watcher: vừa tới paththankyou (chưa hiện form) → không đóng ngay, chờ luồng hoàn tất financialhelp', async t => {
  autoRefill.enabled = false;
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession('198.51.100.95');
  page.frames = () => [page];
  page.evaluate = async callback => callback.name === 'detectOfferContentInPage' ? { hasForm: false, hasChoices: false, challenge: false } : null;
  page.currentUrl = 'https://blog.financialhelpfinder.com/paththankyou.php';
  watchTrafficBlockedPage(session);
  page.emit('framenavigated', page);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(counters.browserCloses, 0, 'paththankyou phải qua kiểm tra ổn định 3 giây của financialhelp, không đóng ngay như thankyou thường');
});
