/**
 * Switch bandwidth sub tab.
 * @param {*} tab tab.
 * @return {void} Kết quả xử lý switch bandwidth sub tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchBandwidthSubTab(tab) {
      _activeBandwidthSubTab = tab;
      const btnSlots = document.getElementById('bwTabBtnSlots');
      const btnDaily = document.getElementById('bwTabBtnDaily');
      const btn711 = document.getElementById('bwTabBtn711');
      const panelSlots = document.getElementById('bwSubPanelSlots');
      const panelDaily = document.getElementById('bwSubPanelDaily');
      const panel711 = document.getElementById('bwSubPanel711');

      if (btnSlots) btnSlots.classList.toggle('active', tab === 'slots');
      if (btnDaily) btnDaily.classList.toggle('active', tab === 'daily');
      if (btn711) btn711.classList.toggle('active', tab === '711');

      if (panelSlots) panelSlots.style.display = tab === 'slots' ? 'block' : 'none';
      if (panelDaily) panelDaily.style.display = tab === 'daily' ? 'block' : 'none';
      if (panel711) panel711.style.display = tab === '711' ? 'block' : 'none';

      if (tab === '711') {
        load711ConsumptionData(true);
      } else {
        renderBandwidthModal();
      }
    }
