import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildLocalBrowserArgs,
  cleanupLocalProfile,
  prepareLocalZeroProfile,
  resolveZeroProfileTemplate,
} from './local-profile-engine.mjs';

test('resolveZeroProfileTemplate tìm thấy thư mục template', () => {
  const templateDir = resolveZeroProfileTemplate();
  assert.ok(templateDir, 'Template directory must exist');
  assert.ok(existsSync(join(templateDir, 'Default', 'Preferences')));
});

test('prepareLocalZeroProfile khởi tạo profile với orbita.config và Preferences hợp lệ', async () => {
  const profilePath = await prepareLocalZeroProfile({
    slot: 99,
    locale: 'vi-VN',
    languages: ['vi-VN', 'vi', 'en-US'],
    bookmarks: [{ title: 'Google', url: 'https://google.com' }],
  });

  try {
    assert.ok(existsSync(profilePath), 'Profile directory must be created');
    assert.ok(existsSync(join(profilePath, 'orbita.config')), 'orbita.config must exist');
    assert.ok(existsSync(join(profilePath, 'Default', 'Preferences')), 'Preferences must exist');
    assert.ok(existsSync(join(profilePath, 'Default', 'Bookmarks')), 'Bookmarks must exist');

    const orbitaRaw = JSON.parse(await readFile(join(profilePath, 'orbita.config'), 'utf8'));
    assert.equal(orbitaRaw.intl.app_locale, 'vi-VN');
    assert.equal(orbitaRaw.intl.accept_languages, 'vi-VN,vi,en-US');

    const prefs = JSON.parse(await readFile(join(profilePath, 'Default', 'Preferences'), 'utf8'));
    assert.equal(prefs.intl.app_locale, 'vi-VN');
    assert.equal(prefs.credentials_enable_service, false);
    assert.equal(prefs.bookmark_bar.editing_enabled, true);

    const bookmarks = JSON.parse(await readFile(join(profilePath, 'Default', 'Bookmarks'), 'utf8'));
    assert.equal(bookmarks.roots.bookmark_bar.children[0].url, 'https://google.com');
  } finally {
    await cleanupLocalProfile(profilePath);
    assert.ok(!existsSync(profilePath), 'Profile directory must be deleted after cleanup');
  }
});

test('buildLocalBrowserArgs sinh đủ các cờ dòng lệnh tương tự Security.dll', () => {
  const flags = buildLocalBrowserArgs({
    profilePath: '/tmp/test_prof',
    proxyUrl: 'http://127.0.0.1:8080',
    tile: { left: 100, top: 200, width: 800, height: 600 },
    locale: 'en-US',
  });

  assert.ok(flags.includes('--remote-debugging-port=0'));
  assert.ok(flags.includes('--user-data-dir=/tmp/test_prof'));
  assert.ok(flags.includes('--disable-blink-features=AutomationControlled'));
  assert.ok(flags.includes('--donut-pie=undefined'));
  assert.ok(flags.includes('--webrtc-ip-handling-policy=disable_non_proxied_udp'));
  assert.ok(flags.includes('--proxy-server=http://127.0.0.1:8080'));
  assert.ok(flags.includes('--window-position=100,200'));
  assert.ok(flags.includes('--window-size=800,600'));
});
