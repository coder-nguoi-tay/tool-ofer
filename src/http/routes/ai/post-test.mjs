import { callAgt } from '../../../../ai-assist.mjs';
import { executeFile } from '../../../runtime/constants/execute-file.mjs';
import { globalAiConfig } from '../../../../ai-assist.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API ai-test.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAiTest(request, response) {
  if (request.method === 'POST' && request.url === '/ai/test') {
    try {
      const body = JSON.parse((await readRequestBody(request)) || '{}');
      const binName = body.binary || globalAiConfig.cliBinary || 'agy';
      const augmentedPath = [join(homedir(), '.local', 'bin'), join(homedir(), '.gemini', 'antigravity-cli', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].filter(Boolean).join(':');
      const {
        stdout
      } = await executeFile(binName, ['--version'], {
        env: {
          ...process.env,
          PATH: augmentedPath
        },
        timeout: 5000
      });
      const versionStr = stdout.trim();

      // Gửi test prompt ngắn để xác thực AI model có khả dụng và phản hồi thật sự
      let promptOk = false;
      let sampleReply = '';
      let promptErr = null;
      try {
        sampleReply = await callAgt('1+1=? Trả lời duy nhất 1 chữ số.', {
          cliBinary: binName,
          timeoutSeconds: 15,
          allowFallback: false
        });
        promptOk = true;
        sampleReply = String(sampleReply || '').trim().slice(0, 80);
      } catch (pErr) {
        promptErr = pErr.message;
      }
      if (promptOk) {
        respondWithJson(response, 200, {
          success: true,
          binary: binName,
          version: versionStr,
          sampleReply,
          message: `✓ Kết nối thành công: ${binName} (${versionStr}) | AI phản hồi tốt: "${sampleReply}"`
        });
      } else {
        respondWithJson(response, 200, {
          success: false,
          binary: binName,
          version: versionStr,
          error: promptErr,
          message: `Binary "${binName}" (${versionStr}) có mặt nhưng AI không thể phản hồi: ${promptErr}. Gợi ý: Hãy kiểm tra quota / quyền hoặc chuyển sang agy.`
        });
      }
    } catch (err) {
      respondWithJson(response, 200, {
        success: false,
        error: err.message,
        message: `Không thể tìm thấy hoặc gọi binary "${body?.binary || 'agy'}": ${err.message}`
      });
    }
    return true;
  }
  return false;
}
