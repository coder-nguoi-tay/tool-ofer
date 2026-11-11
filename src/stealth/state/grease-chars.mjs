/**
 * Giả lập thiết bị và chống fingerprint cho các phiên Chrome do Playwright điều khiển.
 *
 * Nguyên tắc: thứ gì Chrome cho phép đổi tận gốc qua CDP (User-Agent, Client Hints,
 * navigator.platform, số nhân CPU, ngôn ngữ) thì đổi qua CDP; phần còn lại vá bằng JS
 * nhưng hàm vá phải trông như hàm native (toString, name, length) và nhiễu phải ổn định
 * trong cả phiên, vì các bộ dò như CreepJS đọc hai lần để bắt nhiễu ngẫu nhiên.
 */
const greaseChars = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
export { greaseChars };
