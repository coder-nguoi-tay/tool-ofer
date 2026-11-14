// ─── TAB 3: TÀI NGUYÊN — gắn sự kiện cho các tính năng ngang desktop (proxy, 711, email, autofill) ───
(() => {
  const on = (id, type, handler) => document.getElementById(id).addEventListener(type, handler);

  // Hàng đợi proxy
  on('resBtnImportProxy', 'click', miniResImportProxy);
  on('resBtnDedupeProxy', 'click', () => miniResDedupeTextarea('taProxyInput', 'proxy'));
  on('resBtnShuffleProxy', 'click', () => miniResShuffleTextarea('taProxyInput', 'proxy'));
  on('resBtnResetProxy', 'click', miniResResetProxyQueue);

  // 711Proxy
  on('res711ModeSubuser', 'change', () => miniResSwitch711Mode('subuser'));
  on('res711ModeApi', 'change', () => miniResSwitch711Mode('api'));
  for (const id of ['res711SubUser', 'res711SubPass', 'res711Gateway']) on(id, 'change', () => miniResSave711Subuser());
  on('res711BtnSaveSubuser', 'click', () => miniResSave711Subuser(true));
  on('res711BtnLogin', 'click', miniResLogin711);
  on('res711BtnWhitelist', 'click', miniResWhitelist711);
  on('res711BtnCheckIp', 'click', miniResCheckMyIp);
  on('res711BtnCopyIp', 'click', miniResCopyMyIp);
  on('res711BtnGenerate', 'click', miniResGenerate711);
  on('res711AutoRefill', 'change', miniResSave711AutoRefill);
  document.querySelectorAll('#tab-resources [data-res-gb]').forEach((btn) => {
    btn.addEventListener('click', () => miniResSet711Package(btn.dataset.resGb));
  });
  on('res711BtnCustomGb', 'click', () => miniResSet711Package(parseFloat(document.getElementById('res711CustomGb').value)));

  // Email
  on('resBtnDedupeEmail', 'click', () => miniResDedupeTextarea('taEmailInput', 'email', true));
  on('resBtnShuffleEmail', 'click', () => miniResShuffleTextarea('taEmailInput', 'email'));
  on('resEmailFile', 'change', (e) => miniResReadEmailFile(e.target));
  on('resBtnClearEmail', 'click', miniResClearEmail);
  on('resEmailListBox', 'toggle', (e) => { if (e.target.open) miniResLoadEmailList(); });
  for (const id of ['resEmailAutoRefill', 'resEmailAutoRefillPath', 'resEmailAutoRefillBatch']) on(id, 'change', miniResSaveEmailAutoRefill);
  on('resBtnLoadEmailFromPath', 'click', miniResLoadEmailFromPath);
  on('resBtnResetEmailCursor', 'click', miniResResetEmailCursor);

  // Autofill
  on('resBtnLeadZip5', 'click', () => miniResImportPredefinedLead('zip5'));
  on('resBtnLeadFull', 'click', () => miniResImportPredefinedLead('full7k'));
  on('resAutofillListBox', 'toggle', (e) => { if (e.target.open) miniResLoadAutofillList(); });

  // Thanh sức khoẻ proxy: cập nhật khi mở tab và mỗi 15s lúc tab đang hiển thị.
  document.querySelector('.nav-item[data-tab="tab-resources"]').addEventListener('click', miniResRefreshProxyHealth);
  setInterval(() => {
    if (document.getElementById('tab-resources').classList.contains('active')) miniResRefreshProxyHealth();
  }, 15000);

  void miniResInit711();
  void miniResLoadEmailAutoRefill();
  void miniResRefreshProxyHealth();
})();
