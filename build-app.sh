#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=== Compiling native Swift binary ==="
TMP_BIN="/tmp/AutoLeadPCMac_bin"
swiftc -O -parse-as-library AutoLeadPCMacApp.swift -o "$TMP_BIN"

# Tạo một bundle Mac từ source chung, gồm phần tạo profile GoLogin.
# @param $1 Tên bundle .app.
# @param $2 Số instance.
# @param $3 Cổng giao diện.
# @param $4 Bundle ID.
# @param $5 Tên hiển thị.
# @return Bundle đã đóng gói và ký tại thư mục source.
# @author ductv <ductv@getflycrm.com>
# @since 2026-10-19
build_app_bundle() {
  local APP_NAME="$1"
  local INSTANCE_ID="$2"
  local PORT="$3"
  local BUNDLE_ID="$4"
  local DISPLAY_NAME="$5"

  echo "Building $APP_NAME (Bản $INSTANCE_ID, Port $PORT)..."
  local APP_BUNDLE="$APP_NAME"
  local MACOS_DIR="$APP_BUNDLE/Contents/MacOS"
  local RESOURCES_DIR="$APP_BUNDLE/Contents/Resources"
  local LAUNCHER_DIR="$RESOURCES_DIR/launcher"

  rm -rf "$APP_BUNDLE"
  mkdir -p "$MACOS_DIR" "$LAUNCHER_DIR"

  # Copy compiled binary
  cp -p "$TMP_BIN" "$MACOS_DIR/AutoLeadPCMac"
  chmod +x "$MACOS_DIR/AutoLeadPCMac"

  local ICON_FILE="AutoLeadPC"
  if [ "$INSTANCE_ID" = "2" ] && [ -f "AutoLeadPC2.icns" ]; then
    ICON_FILE="AutoLeadPC2"
    cp -p "AutoLeadPC2.icns" "$RESOURCES_DIR/AutoLeadPC2.icns"
  fi

  # Generate customized Info.plist
  cat <<EOF > "$APP_BUNDLE/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>${APP_NAME%.app}</string>
	<key>CFBundleDisplayName</key>
	<string>${DISPLAY_NAME}</string>
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}</string>
	<key>CFBundleExecutable</key>
	<string>AutoLeadPCMac</string>
	<key>CFBundleIconFile</key>
	<string>${ICON_FILE}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.2</string>
	<key>CFBundleVersion</key>
	<string>2</string>
	<key>LSMinimumSystemVersion</key>
	<string>12.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>AutoLeadPCPort</key>
	<integer>${PORT}</integer>
	<key>AutoLeadPCInstance</key>
	<string>${INSTANCE_ID}</string>
	<key>NSAppTransportSecurity</key>
	<dict>
		<key>NSAllowsLocalNetworking</key>
		<true/>
	</dict>
	<key>NSLocalNetworkUsageDescription</key>
	<string>Ứng dụng dùng giao diện cục bộ trên máy này.</string>
</dict>
</plist>
EOF

  # Copy icons
  if [ -d "AutoLeadPC.iconset" ]; then
    if ! iconutil -c icns AutoLeadPC.iconset -o "$RESOURCES_DIR/AutoLeadPC.icns" 2>/dev/null; then
      if [ -f "AutoLeadPC Mac.app/Contents/Resources/AutoLeadPC.icns" ]; then
        cp -p "AutoLeadPC Mac.app/Contents/Resources/AutoLeadPC.icns" "$RESOURCES_DIR/AutoLeadPC.icns"
      fi
    fi
  fi
  if [ -f "autoleadpc-icon.svg" ]; then
    cp -p autoleadpc-icon.svg "$RESOURCES_DIR/autoleadpc-icon.svg"
  fi

  cp -p app.mjs autofill.mjs stealth.mjs stealth.test.mjs survey-solver.mjs survey-solver.test.mjs script.test.mjs ai-assist.mjs lead-check.mjs chrome-versions.mjs chrome-versions.test.mjs screen-view.test.mjs proxy-stop.test.mjs check-duplicate.test.mjs toffers-lead.test.mjs gologin-profile.mjs gologin-profile.test.mjs local-profile-engine.mjs local-profile-engine.test.mjs index.html index-pc.html pc-app.png package.json package-lock.json relay.mjs selfcheck.mjs useragents.txt QA_TEST_CASES.md README.md GOLOGIN.md tgbot.mjs mcp-server.mjs "$LAUNCHER_DIR/"
  if [ -d "Config/Browser" ]; then
    mkdir -p "$LAUNCHER_DIR/Config"
    cp -R Config/Browser "$LAUNCHER_DIR/Config/"
    rm -rf "$LAUNCHER_DIR/Config/Browser/zero_profile/Default/Network"
  fi
  if [ -f "script.mjs" ]; then
    cp -p script.mjs "$LAUNCHER_DIR/"
  fi
  if [ -f "captcha.mjs" ]; then
    cp -p captcha.mjs "$LAUNCHER_DIR/"
  fi

  # Copy node_modules
  if [ -d "node_modules" ]; then
    cp -R node_modules "$LAUNCHER_DIR/"
  fi

  # Sign bundle
  codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true
  echo "✓ Hoàn tất $APP_NAME"
}

# Chỉ build 1 bản ứng dụng duy nhất, chuẩn xác nhất (Port 3210 - Giao diện PC đầy đủ)
rm -f "AutoLeadPC.app/Contents/MacOS/AutoLeadPCMac" 2>/dev/null || true
build_app_bundle "AutoLeadPC.app" "1" 3210 "com.autoleadpc.mac" "AutoLeadPC"

rm -f "$TMP_BIN"

# Deploy to ~/Downloads and ~/Downloads/AutoLeadPC-mac
echo "Dọn dẹp các bản cũ và triển khai bản duy nhất vào ~/Downloads/ ..."
mkdir -p "$HOME/Downloads/AutoLeadPC-mac"

# Xoá triệt để tất cả các bản phân mảnh cũ
rm -rf "$HOME/Downloads/AutoLeadPC Mac 1.app" \
       "$HOME/Downloads/AutoLeadPC Mac 2.app" \
       "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.app" \
       "$HOME/Downloads/AutoLeadPC Mac 3.app" \
       "$HOME/Downloads/AutoLeadPC Wine.app" \
       "$HOME/Downloads/AutoLeadPC Mac.app" \
       "$HOME/Downloads/AutoLeadPC.app" \
       "$HOME/Downloads/AutoLeadPC-mac/"*.app

cp -R "AutoLeadPC.app" "$HOME/Downloads/AutoLeadPC.app"
cp -R "AutoLeadPC.app" "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC.app"

xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC.app" 2>/dev/null || true

# Tạo gói zip tiện gửi hoặc sao lưu
rm -f "$HOME/Downloads/AutoLeadPC.zip" "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.zip" 2>/dev/null || true
(cd "$HOME/Downloads" && zip -rq "AutoLeadPC.zip" "AutoLeadPC.app")

echo "=========================================="
echo "Build thành công 1 bản AutoLeadPC duy nhất:"
echo "AutoLeadPC.app (Cổng 3210, Giao diện PC chuẩn)"
echo "Đã lưu tại: $HOME/Downloads/AutoLeadPC.app"
echo "=========================================="
