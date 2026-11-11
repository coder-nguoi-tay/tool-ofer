import { activeBrowsers } from '../../browser/sessions.mjs';
import { cpus } from 'node:os';
import { hostname as getHostname } from 'node:os';
import { runAgentTask } from './run-agent-task.mjs';

/**
 * Start agent mode.
 * @param {string} hubUrl hub url.
 * @return {Promise<void>} Kết quả xử lý start agent mode.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function startAgentMode(hubUrl) {
  const myHostname = getHostname();
  const agentId = `${myHostname}-${process.pid}`;
  const maxSlots = Math.max(3, Math.min(10, Math.floor(cpus().length / 2)));
  const post = (path, body) => fetch(`${hubUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }).catch(() => {});
  await post('/agent/register', {
    agentId,
    platform: process.platform,
    hostname: myHostname,
    maxSlots
  });
  console.log(`[Agent] Hub: ${hubUrl} | ID: ${agentId} | Slots: ${maxSlots}`);

  // Heartbeat mỗi 10s
  setInterval(() => {
    void post('/agent/heartbeat', {
      agentId,
      freeSlots: maxSlots - activeBrowsers.size
    });
  }, 10_000);

  // Poll loop
  for (;;) {
    try {
      const res = await fetch(`${hubUrl}/agent/task?agentId=${encodeURIComponent(agentId)}`);
      const {
        task
      } = await res.json();
      if (task) {
        console.log(`[Agent] Task ${task.taskId} nhận được, bắt đầu…`);
        void runAgentTask(task).catch(e => console.error(`[Agent] Task ${task.taskId} lỗi: ${e.message}`)).finally(() => post('/agent/result', {
          taskId: task.taskId,
          agentId,
          status: 'done'
        }));
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
}
