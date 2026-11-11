// Khởi tạo và tải dữ liệu lead & point
    try {
      const savedLeadCookie = localStorage.getItem('toffers_custom_cookie');
      if (savedLeadCookie && document.getElementById('leadCustomCookie')) {
        document.getElementById('leadCustomCookie').value = savedLeadCookie;
      }
    } catch { }
