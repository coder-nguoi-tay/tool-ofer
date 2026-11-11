import { element, replayState } from './state.js';
import { loadSession } from './load-session.js';
import { loadSessions } from './load-sessions.js';
import { renderEvent } from './render-event.js';
import { renderTimeline } from './render-timeline.js';
import { saveFeedback } from './save-feedback.js';
import { setRecordingDebug } from './set-recording-debug.js';

element('refresh').addEventListener('click', loadSessions);
element('debug-start').addEventListener('click', () => setRecordingDebug(true));
element('debug-stop').addEventListener('click', () => setRecordingDebug(false));
element('sessions').addEventListener('change', loadSession);
element('tabs').addEventListener('change', renderTimeline);
element('errors-only').addEventListener('change', renderTimeline);
element('events').addEventListener('change', () => renderEvent(element('events').selectedIndex));
element('position').addEventListener('input', () => renderEvent(Number(element('position').value)));
element('previous').addEventListener('click', () => renderEvent(replayState.index - 1));
element('next').addEventListener('click', () => renderEvent(replayState.index + 1));
element('feedback').addEventListener('submit', saveFeedback);
element('feedback').addEventListener('focusin', () => {
  clearInterval(replayState.timer); replayState.timer = null; element('play').textContent = 'Phát từng bước';
});
element('screenshot').addEventListener('error', () => { element('screenshot').hidden = true; element('snapshot-label').textContent = 'Ảnh bằng chứng không còn trên ổ đĩa.'; });
element('play').addEventListener('click', () => {
  if (replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; element('play').textContent = 'Phát từng bước'; return; }
  element('play').textContent = 'Dừng';
  replayState.timer = setInterval(() => {
    if (replayState.index >= replayState.events.length - 1) { clearInterval(replayState.timer); replayState.timer = null; element('play').textContent = 'Phát từng bước'; return; }
    renderEvent(replayState.index + 1);
  }, 1000);
});
window.addEventListener('pagehide', () => clearInterval(replayState.timer));
void loadSessions();
