/**
 * Refresh agents.
 * @return {Promise<void>} Kết quả xử lý refresh agents.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function refreshAgents() {
      const data = await fetch('/agents').then(r => r.json()).catch(() => ({ agents: [], pendingTasks: 0 }));
      renderAgents(data.agents, data.pendingTasks);
    }
