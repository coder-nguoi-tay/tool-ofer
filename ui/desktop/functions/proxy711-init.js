/**
 * Proxy711 init.
 * @return {Promise<void>} Kết quả xử lý proxy711 init.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function proxy711Init() {
      const cfg = await api('/711proxy/config');
      if (cfg) {
        if (cfg.username) document.getElementById('inp711User').value = cfg.username;
        if (cfg.passwd) document.getElementById('inp711Pass').value = cfg.passwd;
        if (cfg.subuser) document.getElementById('inp711SubUser').value = cfg.subuser;
        if (cfg.subpass) document.getElementById('inp711SubPass').value = cfg.subpass;
        if (cfg.gatewayHost && cfg.gatewayPort) {
          const gwVal = `${cfg.gatewayHost}:${cfg.gatewayPort}`;
          const gwEl = document.getElementById('sel711Gateway');
          if (gwEl) {
            let found = false;
            for (const opt of gwEl.options) {
              if (opt.value === gwVal) { gwEl.value = gwVal; found = true; break; }
            }
            if (!found && gwVal) {
              const opt = document.createElement('option');
              opt.value = gwVal;
              opt.textContent = gwVal;
              gwEl.appendChild(opt);
              gwEl.value = gwVal;
            }
          }
        }
        const authMode = cfg.authMode || 'subuser';
        if (authMode === 'api') {
          const rdApi = document.getElementById('rd711ModeApi');
          if (rdApi) rdApi.checked = true;
          switch711AuthMode('api');
        } else {
          const rdSub = document.getElementById('rd711ModeSubuser');
          if (rdSub) rdSub.checked = true;
          switch711AuthMode('subuser');
        }
      }
      const ar = await api('/711proxy/autorefill');
      if (ar && !ar.error) {
        document.getElementById('chk711AutoRefill').checked = !!ar.enabled;
        if (ar.region) document.getElementById('sel711Region').value = ar.region;
        if (ar.count) document.getElementById('inp711Count').value = ar.count;
        if (ar.sessTime) document.getElementById('inp711SessTime').value = ar.sessTime;
        document.getElementById('chk711SessAuto').checked = !!ar.sessAuto;
      }
      void checkMyPublicIp();
    }
