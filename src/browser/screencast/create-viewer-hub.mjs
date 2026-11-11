import { EventEmitter } from 'node:events';

/**
 * Bộ phát frame cho mọi người đang xem một slot (app PC, Telegram mini...), dùng thay cho một response SSE.
 * Người xem mới không đá người cũ và nhận ngay frame gần nhất; người xem chậm chỉ bị bỏ frame của riêng họ.
 * write() trả false khi MỌI người xem đều nghẽn → attachScreencastSession hoãn ack cho tới 'drain'.
 *
 * @return {EventEmitter & {add: Function, remove: Function, write: Function, end: Function, size: number}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createViewerHub() {
  const hub = new EventEmitter();
  const viewers = new Set();
  let lastFrame = null;
  const isOpen = res => !res.writableEnded && !res.destroyed;
  Object.defineProperties(hub, {
    size: {
      get: () => viewers.size
    },
    writableEnded: {
      get: () => ![...viewers].some(isOpen)
    },
    destroyed: {
      get: () => false
    },
    writableNeedDrain: {
      get: () => viewers.size > 0 && [...viewers].every(res => !isOpen(res) || res.writableNeedDrain)
    }
  });
  hub.add = res => {
    viewers.add(res);
    res.on('drain', () => hub.emit('drain'));
    if (lastFrame) res.write(lastFrame);
  };
  hub.remove = res => viewers.delete(res);
  hub.write = chunk => {
    const isFrame = chunk.startsWith('data: ');
    if (isFrame) lastFrame = chunk;
    let flowing = false;
    for (const res of viewers) {
      if (!isOpen(res)) continue;
      if (isFrame && res.writableNeedDrain) continue;
      if (res.write(chunk)) flowing = true;
    }
    return flowing;
  };
  hub.end = () => {
    for (const res of viewers) {
      try {
        res.end();
      } catch {}
    }
  };
  return hub;
}
export { createViewerHub };
