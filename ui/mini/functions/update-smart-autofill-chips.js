/**
 * Update smart autofill chips.
 * @return {void} Kết quả xử lý update smart autofill chips.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function updateSmartAutofillChips() {
      const container = document.getElementById('autofillChipsContainer');
      if (!container) return;
      const cur = activeSessions.find(s => s.slot === currentSlot);
      if (!cur) {
        container.innerHTML = '<span style="font-size:10px;color:#64748b;">Chưa có dữ liệu</span>';
        return;
      }
      const rec = cur.autofillRecord || {};
      const email = cur.assignedEmail || rec.email || rec.mail || '';
      const fname = rec.firstname || rec.firstName || '';
      const lname = rec.lastname || rec.lastName || '';
      const zip = rec.zipcode || rec.zip || '';
      const phone = rec.phonenumber || rec.phone || '';
      const pass = cur.assignedPass || rec.pass || rec.password || '';

      const chips = [];
      if (email) chips.push({ label: `📧 ${email.split('@')[0]}`, full: email, cls: 'chip-email', title: email });
      if (fname) chips.push({ label: `👤 ${fname}`, full: fname, cls: 'chip-name', title: fname });
      if (lname) chips.push({ label: `👤 ${lname}`, full: lname, cls: 'chip-name', title: lname });
      if (zip) chips.push({ label: `📮 ${zip}`, full: zip, cls: 'chip-zip', title: zip });
      if (phone) chips.push({ label: `📱 ${phone}`, full: phone, cls: 'chip-phone', title: phone });
      if (pass) chips.push({ label: `🔑 Mật khẩu`, full: pass, cls: 'chip-pass', title: 'Điền mật khẩu' });

      if (chips.length === 0) {
        container.innerHTML = '<span style="font-size:10px;color:#64748b;">Chưa có profile mẫu</span>';
        return;
      }

      container.innerHTML = chips.map(c => `
        <div class="autofill-chip ${c.cls}" onclick="injectAutofillText('${escHtml(c.full)}')" title="${escHtml(c.title)}">
          <span>${escHtml(c.label)}</span>
        </div>
      `).join('');
    }
