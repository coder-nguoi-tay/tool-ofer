#!/bin/bash
# ============================================================================
# mac-vps-24-7.sh — Biến Mac mini thành "VPS" chạy 24/7 cho AutoLeadPC hub.
#
# Việc script làm (đều idempotent, chạy lại nhiều lần không sao):
#   1) Tắt mọi chế độ ngủ của máy (sleep/disk sleep/power nap), bật wake-on-LAN
#      và tự khởi động lại sau khi mất điện.
#   2) Tắt tự động cài bản cập nhật macOS (tránh máy tự reboot giữa phiên).
#   3) (Tùy chọn) Bật pf allowlist: chỉ cho các dải IP được liệt kê truy cập
#      cổng 3211; mọi IP khác bị drop.
#   4) In checklist các bước còn lại cần mật khẩu/GUI (FileVault, auto-login).
#
# Cách dùng:
#   sudo bash mac-vps-24-7.sh
#   sudo bash mac-vps-24-7.sh --allowlist "192.168.1.0/24,100.64.0.0/10"
#   sudo bash mac-vps-24-7.sh --allowlist off      # gỡ allowlist, mở lại LAN
#
# Lưu ý: hub phải đang chạy (LaunchAgent com.autoleadpc.hub) thì URL mới sống.
# ============================================================================
set -euo pipefail

PORT="${AUTOLEADPC_PORT:-3211}"
ALLOWLIST=""
ANCHOR="com.autoleadpc.allowlist"
PF_CONF="/etc/pf.anchors/${ANCHOR}"
PF_MAIN="/etc/pf.conf"

log() { printf '\033[1;36m[mac-vps]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[mac-vps]\033[0m %s\n' "$*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --allowlist) ALLOWLIST="${2:-}"; shift 2 ;;
    --port) PORT="${2:-3211}"; shift 2 ;;
    *) warn "Tham số không hiểu: $1"; shift ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Cần chạy bằng sudo: sudo bash $0 $*" >&2
  exit 1
fi

log "1/4 Tắt chế độ ngủ (sleep=0, disablesleep=1, disksleep=0, powernap=0)"
pmset -a sleep 0 disablesleep 1 disksleep 0 powernap 0 womp 1 autorestart 1
pmset -g custom | sed -n '1,20p'

log "2/4 Tắt tự động cài cập nhật macOS (giữ kiểm tra thông báo)"
softwareupdate --schedule off >/dev/null 2>&1 || true
defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticallyInstallMacOSUpdates -bool false
defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticDownload -bool false
defaults write /Library/Preferences/com.apple.SoftwareUpdate CriticalUpdateInstall -bool false

if [ -n "$ALLOWLIST" ]; then
  if [ "$ALLOWLIST" = "off" ]; then
    log "3/4 Gỡ allowlist pf cho cổng ${PORT}"
    pfctl -a "$ANCHOR" -F rules 2>/dev/null || true
    sed -i '' "/anchor \"${ANCHOR}\"/d; /load anchor \"${ANCHOR}\"/d" "$PF_MAIN" 2>/dev/null || true
  else
    log "3/4 Bật pf allowlist cho cổng ${PORT}: ${ALLOWLIST}"
    {
      echo "block drop in quick proto tcp from any to any port ${PORT}"
      echo "pass in quick proto tcp from 127.0.0.1 to any port ${PORT}"
      IFS=',' read -r -a CIDRS <<< "$ALLOWLIST"
      for cidr in "${CIDRS[@]}"; do
        cidr="$(echo "$cidr" | tr -d ' ')"
        [ -z "$cidr" ] && continue
        echo "pass in quick proto tcp from ${cidr} to any port ${PORT}"
      done
    } > "$PF_CONF"
    if ! grep -q "anchor \"${ANCHOR}\"" "$PF_MAIN"; then
      {
        echo ""
        echo "anchor \"${ANCHOR}\""
        echo "load anchor \"${ANCHOR}\" from \"${PF_CONF}\""
      } >> "$PF_MAIN"
    fi
    pfctl -f "$PF_MAIN" >/dev/null 2>&1 || true
    pfctl -e >/dev/null 2>&1 || true
    log "   Nội dung allowlist:"; sed 's/^/     /' "$PF_CONF"
  fi
else
  warn "3/4 Bỏ qua allowlist IP (truyền --allowlist \"CIDR1,CIDR2\" nếu cần siết)"
fi

log "4/4 Kiểm tra trạng thái"
curl -fsS -m 5 -o /dev/null "http://127.0.0.1:${PORT}/state" 2>/dev/null \
  && log "   Hub OK: http://127.0.0.1:${PORT}/state phản hồi 200" \
  || warn "   Hub chưa phản hồi — kiểm tra: launchctl print gui/$(stat -f%u /dev/console)/com.autoleadpc.hub"

cat <<'EOF'

────────────────────────────────────────────────────────────────────────
CÒN 2 BƯỚC CẦN BẠN TỰ LÀM (cần mật khẩu máy, macOS chặn script hoá):

  [A] TẮT FILEVAULT (nếu muốn máy tự chạy sau khi mất điện, không cần ai
      ngồi trước máy nhập mật khẩu mở ổ đĩa):
        System Settings → Privacy & Security → FileVault → Turn Off…

  [B] BẬT ĐĂNG NHẬP TỰ ĐỘNG (để LaunchAgent com.autoleadpc.hub tự chạy
      ngay sau khi khởi động):
        System Settings → Users & Groups → Automatically log in as → chọn user
      (FileVault phải TẮT thì mục này mới bật được)

  Nếu giữ FileVault: sau mỗi lần reboot phải nhập mật khẩu ở màn hình khoá
  thì hub mới sống lại; khi đang chạy thì watchdog vẫn tự phục hồi node.
────────────────────────────────────────────────────────────────────────
EOF
