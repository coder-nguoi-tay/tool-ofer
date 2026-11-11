/**
 * New script rrs.
 * @return {void} Kết quả xử lý new script rrs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function newScriptRRS() {
      document.getElementById('txtScriptRRSName').value = 'RRS_' + Date.now() + '.txt';
      document.getElementById('txtScriptRRS').value = '{Note}=RRS Task\n{Delay}=3\n';
    }
