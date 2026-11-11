import { primaryRouteHandlers, screenRouteHandlers } from './route-handlers.mjs';

/**
 * Tạo bộ điều phối HTTP dùng chung cho giao diện desktop, Mac, Mini App và các API.
 * @param {object} context HTML dự phòng và các command đã đăng ký khi khởi động.
 * @return {Function} Listener HTTP xử lý endpoint theo thứ tự hiện có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function createInterfaceRequestHandler(context) {
  return async (request, response) => {
    console.log('[HTTP]', request.method, request.url);
    for (const handleRoute of primaryRouteHandlers) {
      if (await handleRoute(request, response, context)) return;
    }
    for (const handleRoute of screenRouteHandlers) {
      if (await handleRoute(request, response, context)) return;
    }
    response.writeHead(404);
    response.end('Not found');
  };
}
