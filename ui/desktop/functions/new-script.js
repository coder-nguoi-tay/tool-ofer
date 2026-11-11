/**
 * New script.
 * @return {void} Kết quả xử lý new script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function newScript() {
      currentScriptPath = '';
      document.getElementById('txtNameScript').value = 'Script_' + Date.now() + '.txt';
      document.getElementById('txtScript').value = '{EmailConfig}\n{InfoConfig}\n{Delay}=2\n';
    }
