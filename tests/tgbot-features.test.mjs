import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

test('tgbot.mjs contains all new commands and handlers', async () => {
  const directory = new URL("../src/tgbot/", import.meta.url);
  const files = (await readdir(directory, { recursive: true })).filter((name) => name.endsWith('.mjs'));
  const content = (await Promise.all(files.map((name) => readFile(new URL(name, directory), 'utf8')))).join('\n');

  // Kiểm tra các preset buttons
  assert.match(content, /text: '📶 Băng thông',\s*cb: 'bw'/);
  assert.match(content, /text: '📺 Màn hình',\s*cb: 'screen'/);
  assert.match(content, /text: '🌐 DS Slot',\s*cb: 'slots'/);

  // Kiểm tra sendPhoto function
  assert.match(content, /async function sendPhoto\(chatId, imageBuffer, caption = '', buttons = null\)/);
  assert.match(content, /formData\.append\('photo', blob, 'screenshot\.jpg'\)/);

  // Kiểm tra các lệnh trong execCommand
  assert.match(content, /name === '\/bw' \|\| name === '\/bandwidth'/);
  assert.match(content, /name === '\/screen' \|\| name === '\/snap'/);
  assert.match(content, /name === '\/slots' \|\| name === '\/browsers'/);
  assert.match(content, /name === '\/close' \|\| name === '\/kill'/);

  // Kiểm tra xử lý callback cho screen và close_slot
  assert.match(content, /data\.startsWith\('screen_'\)/);
  assert.match(content, /data\.startsWith\('close_slot_'\)/);

  // Kiểm tra cảnh báo số dư 711Proxy thấp trong checkAndNotify
  assert.match(content, /low711BalanceNotified/);
  assert.match(content, /p711\.remainingGb <= 1(?:\.0)?/);

  // Kiểm tra đăng ký danh sách gợi ý lệnh khi gõ "/"
  assert.match(content, /const BOT_COMMANDS = \[/);
  assert.match(content, /command: 'status'/);
  assert.match(content, /command: 'bw'/);
  assert.match(content, /command: 'screen'/);
  assert.match(content, /command: 'slots'/);
  assert.match(content, /command: 'close'/);
  assert.match(content, /setMyCommands/);
  assert.match(content, /setChatMenuButton/);

  // Kiểm tra NLP tiếng Việt
  assert.match(content, /băng thông\|dung lượng\|tiêu hao\|data/);
  assert.match(content, /chụp\|screen\|màn hình\|snapshot/);
  assert.match(content, /tắt\|đóng\|kill\|close/);
});
