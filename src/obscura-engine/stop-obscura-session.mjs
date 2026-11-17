/**
 * Dừng đúng child process Obscura và đợi xác nhận thoát trước khi nhả proxy/IP.
 * @param {import('node:child_process').ChildProcess|number} processOrPid Process thuộc phiên hoặc PID tương thích cũ.
 * @return {Promise<void>} Process đã dừng, không chỉ vừa gửi signal.
 * @throws {Error} Khi không gửi được signal hoặc process chưa thoát sau 5 giây.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export async function stopObscuraSession(processOrPid) {
  if (!processOrPid) return;
  if (typeof processOrPid === 'number') {
    try { process.kill(processOrPid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    return;
  }
  const child = processOrPid;
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.removeListener('exit', onExit); reject(new Error('Obscura chưa xác nhận dừng; giữ khóa proxy/IP.')); }, 5000);
    /**
     * Nhả listener và chốt việc dừng khi child phát exit.
     * @return {void}
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    function onExit() { clearTimeout(timer); child.stdout?.destroy(); child.stderr?.destroy(); resolve(); }
    child.once('exit', onExit);
    if (!child.kill('SIGKILL')) { clearTimeout(timer); child.removeListener('exit', onExit); reject(new Error('Không gửi được lệnh dừng Obscura.')); }
  });
}
