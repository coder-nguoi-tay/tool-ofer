/**
 * Bộ đọc theo số byte chính xác trên socket.
 *
 * @param {import('node:net').Socket} socket Socket cần đọc.
 * @return {{read: (size: number) => Promise<Buffer>, detach: () => Buffer}} Bộ đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createReader(socket) {
  let buffer = Buffer.alloc(0);
  let waiter = null;
  let failure = null;
  const settle = () => {
    if (!waiter) return;
    if (buffer.length >= waiter.size) {
      const {
        size,
        resolve
      } = waiter;
      waiter = null;
      const head = buffer.subarray(0, size);
      buffer = buffer.subarray(size);
      resolve(head);
      return;
    }
    if (failure) {
      const {
        reject
      } = waiter;
      waiter = null;
      reject(failure);
    }
  };
  const onData = chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    settle();
  };
  const onEnd = () => {
    failure ??= new Error('đối phương đóng kết nối giữa lúc bắt tay');
    settle();
  };
  const onError = error => {
    failure ??= error;
    settle();
  };
  socket.on('data', onData);
  socket.on('end', onEnd);
  socket.on('close', onEnd);
  socket.on('error', onError);
  return {
    read(size) {
      if (size === 0) return Promise.resolve(Buffer.alloc(0));
      return new Promise((resolve, reject) => {
        // ponytail: một waiter tại một thời điểm, đủ vì bắt tay SOCKS5 là tuần tự.
        if (waiter) return reject(new Error('đọc lồng nhau'));
        waiter = {
          size,
          resolve,
          reject
        };
        settle();
      });
    },
    // Trả lại phần byte đã đọc trước mà chưa dùng, và thôi can thiệp vào socket.
    detach() {
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('close', onEnd);
      socket.off('error', onError);
      return buffer;
    }
  };
}
export { createReader };
