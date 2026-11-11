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

// Patch browser tools before registering CLI commands:
// 1. Parameter Normalization: Maps `selector`, `element`, or `css` -> `target`
//    and `value` -> `text` across all browser tools before Zod schema validation.
// 2. Human Keystroke Simulation: Intercepts `browser_type` to enforce `slowly=true`,
//    human typing jitter (35-60ms/char), and inter-field settle pause (120-200ms).
if (tools && Array.isArray(tools.browserTools)) {
  for (const tool of tools.browserTools) {
    if (tool?.schema?.inputSchema) {
      const origParse = tool.schema.inputSchema.parse?.bind(tool.schema.inputSchema);
      if (typeof origParse === 'function') {
        tool.schema.inputSchema.parse = function normalizeAndParse(rawArgs, ...rest) {
          if (rawArgs && typeof rawArgs === 'object') {
            if (!rawArgs.target && (rawArgs.selector || rawArgs.element || rawArgs.css)) {
              rawArgs.target = rawArgs.selector || rawArgs.element || rawArgs.css;
            }
            if (rawArgs.text === undefined && rawArgs.value !== undefined) {
              rawArgs.text = String(rawArgs.value);
            }
          }
          return origParse(rawArgs, ...rest);
        };
      }

      const origSafeParse = tool.schema.inputSchema.safeParse?.bind(tool.schema.inputSchema);
      if (typeof origSafeParse === 'function') {
        tool.schema.inputSchema.safeParse = function normalizeAndSafeParse(rawArgs, ...rest) {
          if (rawArgs && typeof rawArgs === 'object') {
            if (!rawArgs.target && (rawArgs.selector || rawArgs.element || rawArgs.css)) {
              rawArgs.target = rawArgs.selector || rawArgs.element || rawArgs.css;
            }
            if (rawArgs.text === undefined && rawArgs.value !== undefined) {
              rawArgs.text = String(rawArgs.value);
            }
          }
          return origSafeParse(rawArgs, ...rest);
        };
      }
    }
  }

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

// Repair SDK đi qua cùng ranh giới dữ liệu, không cấp quyền submit dựa riêng vào prompt.
if (process.env.AUTOLEADPC_REPAIR_ONLY === '1') {
  const allowedValues = JSON.parse(process.env.AUTOLEADPC_REPAIR_VALUES || '[]');
  for (const tool of tools.browserTools || []) {
    if (typeof tool.handle !== 'function') continue;
    const originalHandle = tool.handle;
    /**
     * Chặn thao tác vượt quyền trước khi MCP thực thi trên trình duyệt thật.
     * @param {object} context Context MCP.
     * @param {object} parameters Tham số tool đã parse.
     * @param {*} rest Response và abort signal được truyền nguyên vẹn.
     * @return {Promise<*>} Kết quả tool được phép.
     * @throws {Error} Tool/value vượt quyền repair.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-11
     */
    tool.handle = async function guardedRepairTool(context, parameters, ...rest) {
      const { enforceMcpRepairPolicy } = await import('./src/ai-assist/repair/enforce-mcp-repair-policy.mjs');
      enforceMcpRepairPolicy(tool.schema.name, parameters, allowedValues);
      return originalHandle.call(this, context, parameters, ...rest);
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
