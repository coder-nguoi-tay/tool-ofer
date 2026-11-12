#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

APP_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="24"

APP_NAME="AutoLeadPC Mac 2 AdsPower.app"
INSTALLED_APP="/Applications/$APP_NAME"
if pgrep -f "^$INSTALLED_APP/Contents/MacOS/AutoLeadPCMac$" >/dev/null; then
  echo "Hãy thoát AutoLeadPC trước khi build để cập nhật đúng app đang sử dụng." >&2
  exit 1
fi
BUILD_DIRECTORY="$(mktemp -d "/Applications/.AutoLeadPC-build.XXXXXX")"

# Dọn staging sau khi build; phục hồi app cũ nếu thao tác thay bản mới bị gián đoạn.
# @return Dọn thư mục tạm hoặc giữ lại bản cũ nếu không thể phục hồi.
# @author ductv <ductv@getflycrm.com>
# @since 2026-11-11
cleanup_app_build() {
  if [ -d "$BUILD_DIRECTORY/previous.app" ] && [ ! -e "$INSTALLED_APP" ]; then
    if ! mv "$BUILD_DIRECTORY/previous.app" "$INSTALLED_APP"; then
      echo "Chưa phục hồi được app cũ; bản đó còn ở $BUILD_DIRECTORY/previous.app" >&2
      return 1
    fi
  fi
  rm -rf "$BUILD_DIRECTORY"
}
trap cleanup_app_build EXIT

echo "=== Compiling native Swift binary ==="
TMP_BIN="$BUILD_DIRECTORY/AutoLeadPCMac_bin"
swiftc -O -parse-as-library AutoLeadPCMacApp.swift -o "$TMP_BIN"

# Tạo bundle Mac từ source chung với luồng Chrome và AdsPower.
# @param $1 Tên bundle .app.
# @param $2 Số instance.
# @param $3 Cổng giao diện.
# @param $4 Bundle ID.
# @param $5 Tên hiển thị.
# @return Bundle đã đóng gói và ký trong staging, sẵn sàng thay app duy nhất.
# @author ductv <ductv@getflycrm.com>
# @since 2026-11-11
build_app_bundle() {
  local APP_NAME="$1"
  local INSTANCE_ID="$2"
  local PORT="$3"
  local BUNDLE_ID="$4"
  local DISPLAY_NAME="$5"

  echo "Building $APP_NAME (Bản $INSTANCE_ID, Port $PORT)..."
  local APP_BUNDLE="$BUILD_DIRECTORY/$APP_NAME"
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
	<string>${APP_VERSION}</string>
	<key>CFBundleVersion</key>
	<string>${BUILD_NUMBER}</string>
	<key>LSMinimumSystemVersion</key>
	<string>12.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSSupportsAppNap</key>
	<false/>
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

  # Chép toàn bộ test cùng cấu trúc thư mục và các fixture HTML được dùng chung.
  cp -R tests mock-pages "$LAUNCHER_DIR/"
  # Test đóng gói cần source compiler và script thật, kể cả khi chạy trong bundle.
  cp -p build-app.sh AutoLeadPCMacApp.swift AutoLeadPC2.icns autoleadpc-icon.svg "$LAUNCHER_DIR/"
  cp -p app.mjs autofill.mjs option-scorer.mjs observer.mjs analyze-ops.mjs stealth.mjs cloakbrowser-engine.mjs survey-solver.mjs ai-assist.mjs lead-check.mjs chrome-versions.mjs adspower-profile.mjs codex-form-agent.mjs local-profile-engine.mjs playwright-mcp-human.cjs pc-app.png package.json package-lock.json relay.mjs useragents.txt QA_TEST_CASES.md README.md tgbot.mjs tunnel.mjs mcp-server.mjs "$LAUNCHER_DIR/"
  cp -R src ui "$LAUNCHER_DIR/"
  # Chỉ chép Config/Browser: Config/Settings có thể chứa token, không được vào bundle.
  mkdir -p "$LAUNCHER_DIR/Config"
  cp -R Config/Browser "$LAUNCHER_DIR/Config/"
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

  # Copy Node runtime độc lập (bản chính thức nodejs.org, không phụ thuộc Homebrew).
  # Launcher Swift ưu tiên Resources/runtime-node/node trước khi thử node hệ thống,
  # nên app chạy được trên mọi máy Mac (arm64) kể cả chưa cài Homebrew.
  if [ -f "runtime-node/node" ]; then
    mkdir -p "$RESOURCES_DIR/runtime-node"
    cp -p "runtime-node/node" "$RESOURCES_DIR/runtime-node/node"
    chmod +x "$RESOURCES_DIR/runtime-node/node"
  fi

  # Sign bundle
  codesign --force --deep --sign - "$APP_BUNDLE"
  codesign --verify --deep --strict "$APP_BUNDLE"
  echo "✓ Hoàn tất $APP_NAME"
}

# Chỉ phát hành một app cố định; staging được dọn, không tạo ZIP hoặc backup lưu lâu dài.
build_app_bundle "$APP_NAME" "2" 3211 "com.autolead.mac2.adspower" "AutoLeadPC Mac 2 AdsPower"

if [ -d "$INSTALLED_APP" ]; then
  mv "$INSTALLED_APP" "$BUILD_DIRECTORY/previous.app"
fi
mv "$BUILD_DIRECTORY/$APP_NAME" "$INSTALLED_APP"
xattr -dr com.apple.quarantine "$INSTALLED_APP" 2>/dev/null || true

echo "Build thành công phiên bản $APP_VERSION (build $BUILD_NUMBER):"
echo "  $INSTALLED_APP"
