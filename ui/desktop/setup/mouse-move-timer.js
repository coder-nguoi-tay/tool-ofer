// Khai báo ở đây (không phải trong _startScreenStream) để _stopScreenStream dọn được; trước đây đọc biến chưa khai báo
    // làm _stopScreenStream ném ReferenceError, nên mở màn hình live không bao giờ kết nối.
    let _mouseMoveTimer = null;
