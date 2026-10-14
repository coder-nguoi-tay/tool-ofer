#!/usr/bin/env bash
set -e

echo "Building AutoLeadPC Mac.app..."
cd "$(dirname "$0")"

APP_BUNDLE="AutoLeadPC Mac.app"
MACOS_DIR="$APP_BUNDLE/Contents/MacOS"
RESOURCES_DIR="$APP_BUNDLE/Contents/Resources"
LAUNCHER_DIR="$RESOURCES_DIR/launcher"

mkdir -p "$MACOS_DIR" "$LAUNCHER_DIR"

# 1. Compile Swift native wrapper
echo "Compiling AutoLeadPCMacApp.swift..."
swiftc -O -parse-as-library AutoLeadPCMacApp.swift -o "$MACOS_DIR/AutoLeadPCMac"

# 2. Copy Info.plist and icons
cp -p Info.plist "$APP_BUNDLE/Contents/Info.plist"
if [ -d "AutoLeadPC.iconset" ]; then
  iconutil -c icns AutoLeadPC.iconset -o "$RESOURCES_DIR/AutoLeadPC.icns"
fi
if [ -f "autoleadpc-icon.svg" ]; then
  cp -p autoleadpc-icon.svg "$RESOURCES_DIR/autoleadpc-icon.svg"
fi

# 3. Sync launcher files
echo "Syncing launcher files into app bundle..."
cp -p app.mjs autofill.mjs chrome-versions.mjs chrome-versions.test.mjs index.html package.json package-lock.json relay.mjs selfcheck.mjs useragents.txt QA_TEST_CASES.md README.md demoqa.test.mjs demoqa-live.test.mjs verify-logging.mjs "$LAUNCHER_DIR/"

# If root has node_modules, copy or link to launcher
if [ -d "node_modules" ] && [ ! -d "$LAUNCHER_DIR/node_modules" ]; then
  echo "Copying node_modules into launcher..."
  cp -R node_modules "$LAUNCHER_DIR/"
fi

echo "Signing app bundle..."
codesign --force --deep --sign - "$APP_BUNDLE"

echo "Build complete: $APP_BUNDLE"
