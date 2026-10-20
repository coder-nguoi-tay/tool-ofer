#!/usr/bin/env node
/**
 * Playwright MCP Human Typing Wrapper:
 * Intercepts Playwright MCP to enforce human-like character-by-character typing.
 *
 * Guarantees:
 * 1. Automatically forces `slowly = true` on every `browser_type` tool invocation,
 *    preventing instant bulk paste/fill.
 * 2. Injects a realistic typing delay (35-65ms per character with jitter)
 *    so text appears keystroke-by-keystroke on screen and fires native keyboard events.
 * 3. Introduces a brief settling pause after typing each field (120-200ms)
 *    for form validators and UI debouncers to settle naturally.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */

const { program } = require('playwright-core/lib/utilsBundle');
const { tools, libCli } = require('playwright-core/lib/coreBundle');
const packageJSON = require('@playwright/mcp/package.json');

// Patch browser_type tool before registering CLI commands
if (tools && Array.isArray(tools.browserTools)) {
  const typeTool = tools.browserTools.find((t) => t.schema?.name === 'browser_type');
  if (typeTool && typeof typeTool.handle === 'function') {
    const originalHandle = typeTool.handle;

    typeTool.handle = async function humanTypeHandle(context, params, response, signal) {
      // 1. Luôn ép buộc chế độ gõ tuần tự từng ký tự
      if (params) {
        params.slowly = true;
      }

      // 2. Cài đặt delay gõ phím ngẫu nhiên mô phỏng người thật (35-60ms/ký tự)
      try {
        const tab = await context?.ensureTab?.();
        if (tab) {
          const humanDelay = 35 + Math.floor(Math.random() * 25);
          tab.actionTimeoutOptions = {
            ...(tab.actionTimeoutOptions || {}),
            delay: humanDelay,
          };
        }
      } catch {
        // Tiếp tục ngay cả khi không lấy được tab
      }

      // 3. Thực thi gõ phím tuần tự
      const result = await originalHandle.call(this, context, params, response, signal);

      // 4. Nghỉ nhẹ giữa các trường thông tin (120-200ms) để form validator và UI debounce tự nhiên
      const settlePause = 120 + Math.floor(Math.random() * 80);
      await new Promise((resolve) => setTimeout(resolve, settlePause));

      return result;
    };
  }
}

if (process.argv.includes('install-browser')) {
  const argv = process.argv.map((arg) => (arg === 'install-browser' ? 'install' : arg));
  libCli.decorateProgram(program);
  void program.parseAsync(argv);
} else {
  const p = program.version('Version ' + packageJSON.version).name('Playwright MCP (Human Mode)');
  tools.decorateMCPCommand(p, packageJSON.version);
  void program.parseAsync(process.argv);
}
