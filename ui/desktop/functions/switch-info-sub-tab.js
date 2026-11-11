/**
 * Switch info sub tab.
 * @param {*} infotab infotab.
 * @return {void} Kết quả xử lý switch info sub tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchInfoSubTab(infotab) {
      document.querySelectorAll('.sub-tab[data-infotab]').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-infotab') === infotab);
      });
      document.querySelectorAll('#panel-Info .sub-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById(`infopanel-${infotab}`);
      if (target) target.classList.add('active');
      if (infotab === 'proxy') void loadProxyQueue();
      if (infotab === '711') void proxy711FetchBalance();
      if (infotab === 'email') { void loadEmailList(); void loadAutoRefillConfig(); }
      if (infotab === 'lead') void loadAutofillList();
    }
