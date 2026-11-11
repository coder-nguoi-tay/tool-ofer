/**
 * Load autofill list.
 * @return {Promise<void>} Kết quả xử lý load autofill list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadAutofillList() {
      const data = await api('/autofill-queue');
      const tbody = document.getElementById('dgvInfoBody');
      const avail = data?.available || 0;
      const used = data?.used || 0;
      if (document.getElementById('lbTotalInfo')) document.getElementById('lbTotalInfo').textContent = avail + used;
      if (document.getElementById('lbAvailInfo')) document.getElementById('lbAvailInfo').textContent = avail;
      if (document.getElementById('lbUsedInfo')) document.getElementById('lbUsedInfo').textContent = used;

      if (data && data.availableList && data.availableList.length > 0) {
        tbody.innerHTML = '';
        data.availableList.forEach((item, idx) => {
          const tr = document.createElement('tr');
          const fname = item.firstname || item.first_name || item.fName || '';
          const lname = item.lastname || item.last_name || item.lName || '';
          const gender = item.gender || item.sex || '';
          const sex = item.sex || item.gender || '';
          const day = item.birthday || item.bDay || '';
          const month = item.birthmonth || item.bMonth || '';
          const year = item.birthyear || item.bYear || '';
          const phone = item.phone || item.phonenumber || item.cellphone || '';
          const address = item.address || item.addressline1 || item.streetaddress || '';
          const city = item.city || '';
          const state = item.state || item.stateorprovince || '';
          const zip = item.zipcode || item.zip || item.ziporpostcode || item.zip_code || '';
          const username = item.userid || item.username || '';
          const password = item.password ? '******' : '';
          const email = item.email || '';
          tr.innerHTML = `
            <td class="cell-selector">${idx === 0 ? '►' : ''}</td>
            <td>${fname}</td>
            <td>${lname}</td>
            <td>${gender}</td>
            <td>${sex}</td>
            <td>${day}</td>
            <td>${month}</td>
            <td>${year}</td>
            <td>${phone}</td>
            <td>${address}</td>
            <td>${city}</td>
            <td>${state}</td>
            <td>${zip}</td>
            <td>${username}</td>
            <td>${password}</td>
            <td>${email}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        tbody.innerHTML = '<tr><td class="cell-selector">►</td><td colspan="15" style="text-align:center;color:#888888;padding:25px;">Chưa có dữ liệu Autofill hoặc hàng đợi đã hết.</td></tr>';
      }
    }
