import { LOCAL_PROFILES_DIR } from './state/local-profiles-dir.mjs';
import { copyRecursive } from './copy-recursive.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolveZeroProfileTemplate } from './resolve-zero-profile-template.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Chuẩn bị một profile cục bộ cô lập dựa trên template zero_profile của bản PC gốc,
 * cập nhật Preferences, Bookmarks và cấu hình orbita.config.
 *
 * @param {object} options Tham số luồng (slot, proxy, locale, languages, bookmarks).
 * @return {Promise<string>} Đường dẫn thư mục profile cục bộ đã khởi tạo.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function prepareLocalZeroProfile({
  slot = 1,
  locale = 'en-US',
  languages = ['en-US', 'en'],
  bookmarks = []
} = {}) {
  await mkdir(LOCAL_PROFILES_DIR, {
    recursive: true,
    mode: 0o700
  });
  const uniqueId = `gologin_${Date.now()}_slot_${slot}_${Math.random().toString(36).slice(2, 7)}`;
  const templateDir = resolveZeroProfileTemplate();
  if (!templateDir) throw new Error('Thiếu Config/Browser/zero_profile/Default/Preferences để tạo profile theo bản PC gốc.');
  const profilePath = join(LOCAL_PROFILES_DIR, uniqueId);
  await copyRecursive(templateDir, profilePath);

  // Ghi orbita.config giống hệt bản PC gốc
  const orbitaConfig = {
    intl: {
      accept_languages: languages.join(','),
      selected_languages: languages.join(','),
      app_locale: locale,
      forced_languages: [locale]
    }
  };
  await writeFile(join(profilePath, 'orbita.config'), JSON.stringify(orbitaConfig, null, 2), 'utf8');

  // Chỉnh sửa Preferences của Chromium (sub_18002b250 trong Security.dll)
  const prefsPath = join(profilePath, 'Default', 'Preferences');
  let prefs = {};
  if (existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(await readFile(prefsPath, 'utf8'));
    } catch {
      prefs = {};
    }
  }
  prefs.intl = {
    ...prefs.intl,
    accept_languages: languages.join(','),
    app_locale: locale,
    selected_languages: languages.join(',')
  };
  prefs.bookmark_bar = {
    ...prefs.bookmark_bar,
    editing_enabled: true,
    show_on_all_tabs: true
  };
  prefs.credentials_enable_service = false;
  prefs.history = {
    ...prefs.history,
    saving_disabled: false
  };
  prefs.profile = {
    ...prefs.profile,
    password_manager_enabled: false
  };
  await writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');

  // Chỉnh sửa Bookmarks nếu có (sub_180030f40 trong Security.dll)
  if (Array.isArray(bookmarks) && bookmarks.length > 0) {
    const bookmarksPath = join(profilePath, 'Default', 'Bookmarks');
    const bookmarkEntries = bookmarks.map((b, i) => ({
      date_added: String(Date.now() * 1000 + i),
      id: String(i + 1),
      name: b.name || b.title || b.url,
      type: 'url',
      url: b.url || b
    }));
    const bookmarksData = {
      checksum: '',
      roots: {
        bookmark_bar: {
          children: bookmarkEntries,
          date_added: '13200000000000000',
          date_modified: '13200000000000000',
          id: '1',
          name: 'Bookmarks bar',
          type: 'folder'
        },
        other: {
          children: [],
          id: '2',
          name: 'Other bookmarks',
          type: 'folder'
        },
        synced: {
          children: [],
          id: '3',
          name: 'Mobile bookmarks',
          type: 'folder'
        }
      },
      version: 1
    };
    await writeFile(bookmarksPath, JSON.stringify(bookmarksData, null, 2), 'utf8');
  }
  return profilePath;
}
export { prepareLocalZeroProfile };
