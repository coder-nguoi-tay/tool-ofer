/**
 * Show win confirm.
 * @param {string} message message.
 * @param {*} onConfirm on confirm.
 * @param {string} title title.
 * @return {void} Kết quả xử lý show win confirm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function showWinConfirm(message, onConfirm, title = 'AutoLeadPC') {
      document.getElementById('winMsgBoxTitle').textContent = title;
      document.getElementById('winMsgBoxContent').textContent = message;
      const btnRow = document.getElementById('winMsgBoxBtnRow');
      btnRow.innerHTML = '';
      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'win-btn';
      btnCancel.style.cssText = 'padding:3px 18px;';
      btnCancel.textContent = 'Hủy';
      btnCancel.onclick = () => closeWinAlert();
      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'win-btn win-btn-primary';
      btnOk.style.cssText = 'padding:3px 24px;';
      btnOk.textContent = 'OK';
      btnOk.onclick = () => { closeWinAlert(); onConfirm(); };
      btnRow.appendChild(btnCancel);
      btnRow.appendChild(btnOk);
      document.getElementById('winMsgBoxOverlay').style.display = 'flex';
    }
