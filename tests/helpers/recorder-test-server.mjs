import { createServer } from 'node:http';
import { serveUiAsset } from '../../src/http/ui-assets.mjs';
import { handleGetReplayPage } from '../../src/http/routes/browser/get-replay-page.mjs';
import { handleGetReplaySession } from '../../src/http/routes/browser/get-replay-session.mjs';
import { handleGetReplayArtifact } from '../../src/http/routes/browser/get-replay-artifact.mjs';
import { handlePostReplayFeedback } from '../../src/http/routes/browser/post-replay-feedback.mjs';
import { handlePostRecordingDebug } from '../../src/http/routes/browser/post-recording-debug.mjs';

/**
 * Tạo máy chủ local cho recorder và trang xem lại, không gọi website/API bên ngoài.
 * @return {Promise<object>} HTTP server và URL cục bộ dùng trong bài test.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function createRecorderTestServer() {
  const handlers = [serveUiAsset, handleGetReplayPage, handleGetReplaySession, handleGetReplayArtifact, handlePostReplayFeedback, handlePostRecordingDebug];
  const server = createServer(async (request, response) => {
    try {
      for (const handler of handlers) if (await handler(request, response)) return;
      if (request.url === '/failure') { response.writeHead(503); response.end('temporary failure'); return; }
      response.writeHead(200, { 'content-type': 'text/html' });
      if (request.url === '/child') {
        response.end('<button id="child-button">Child action</button>'); return;
      }
      response.end(`<!doctype html><html><body><h1>Offline form</h1>
        <form id="registration" onsubmit="event.preventDefault();this.hidden=true">
          <input id="email" name="email"><input id="password" type="password">
          <button id="submit">Submit</button></form>
        <a id="next" href="/completed">Next page</a><iframe src="/child"></iframe>
        </body></html>`);
    } catch (error) { response.writeHead(500); response.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/**
 * Chờ bằng chứng bất đồng bộ với giới hạn thời gian, không làm chậm các bài test đã đạt.
 * @param {function} condition Điều kiện cần đạt.
 * @return {Promise<void>} Hoàn tất khi điều kiện đúng.
 * @throws {Error} Khi recorder không tạo được dữ liệu trong 8 giây.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function waitForRecording(condition) {
  const deadline = Date.now() + 8000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Recorder chưa tạo được bằng chứng mong đợi.');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
