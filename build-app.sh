#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "=== Compiling native Swift binary ==="
TMP_BIN="/tmp/AutoLeadPCMac_bin"
swiftc -O -parse-as-library AutoLeadPCMacApp.swift -o "$TMP_BIN"

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

  cp -p app.mjs autofill.mjs survey-solver.mjs survey-solver.test.mjs script.test.mjs ai-assist.mjs lead-check.mjs chrome-versions.mjs chrome-versions.test.mjs screen-view.test.mjs proxy-stop.test.mjs check-duplicate.test.mjs toffers-lead.test.mjs index.html index-pc.html pc-app.png package.json package-lock.json relay.mjs selfcheck.mjs useragents.txt QA_TEST_CASES.md README.md tgbot.mjs "$LAUNCHER_DIR/"
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

# 1. Build Bản 1 (Port 3210)
build_app_bundle "AutoLeadPC Mac 1.app" "1" 3210 "com.autoleadpc.mac.1" "AutoLeadPC Mac 1"

# 2. Build Bản 2 (Port 3211 - Giao diện Windows PC)
build_app_bundle "AutoLeadPC Mac 2.app" "2" 3211 "com.autoleadpc.mac.2" "AutoLeadPC (PC Edition)"

# 3. Build default bundle "AutoLeadPC Mac.app" (Port 3210)
# (Tránh lỗi Text file busy nếu bản hiện tại đang mở bằng cách rm binary trước)
rm -f "AutoLeadPC Mac.app/Contents/MacOS/AutoLeadPCMac" 2>/dev/null || true
build_app_bundle "AutoLeadPC Mac.app" "1" 3210 "com.autoleadpc.mac" "AutoLeadPC Mac"

rm -f "$TMP_BIN"

# Deploy to ~/Downloads and ~/Downloads/AutoLeadPC-mac
echo "Deploying to ~/Downloads/ and ~/Downloads/AutoLeadPC-mac/ ..."
mkdir -p "$HOME/Downloads/AutoLeadPC-mac"
rm -rf "$HOME/Downloads/AutoLeadPC Mac 1.app" "$HOME/Downloads/AutoLeadPC Mac 2.app" "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.app" "$HOME/Downloads/AutoLeadPC Mac.app"
rm -rf "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 1.app" "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 2.app" "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 2 - Chrome.app" "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac.app"

cp -R "AutoLeadPC Mac 1.app" "$HOME/Downloads/"
cp -R "AutoLeadPC Mac 2.app" "$HOME/Downloads/"
cp -R "AutoLeadPC Mac 2.app" "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.app"
cp -R "AutoLeadPC Mac.app" "$HOME/Downloads/"
cp -R "AutoLeadPC Mac 1.app" "$HOME/Downloads/AutoLeadPC-mac/"
cp -R "AutoLeadPC Mac 2.app" "$HOME/Downloads/AutoLeadPC-mac/"
cp -R "AutoLeadPC Mac 2.app" "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 2 - Chrome.app"
cp -R "AutoLeadPC Mac.app" "$HOME/Downloads/AutoLeadPC-mac/"

xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC Mac 1.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC Mac 2.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC Mac.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 1.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 2.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac 2 - Chrome.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC-mac/AutoLeadPC Mac.app" 2>/dev/null || true
xattr -dr com.apple.quarantine "$HOME/Downloads/AutoLeadPC" 2>/dev/null || true

# Tạo gói zip tiện gửi hoặc sao lưu
rm -f "$HOME/Downloads/AutoLeadPC Mac 2 - Chrome.zip" 2>/dev/null || true
(cd "$HOME/Downloads" && zip -rq "AutoLeadPC Mac 2 - Chrome.zip" "AutoLeadPC Mac 2 - Chrome.app")


echo "=========================================="
echo "Build thành công 2 bản AutoLeadPC cho Mac:"
echo "1. AutoLeadPC Mac 1.app (Cổng 3210)"
echo "2. AutoLeadPC Mac 2.app (Cổng 3211)"
echo "Đã lưu tại: $HOME/Downloads/"
echo "=========================================="
