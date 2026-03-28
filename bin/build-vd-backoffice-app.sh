#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="VD Backoffice"
BUILD_DIR="$ROOT/.build/vd-backoffice-app"
SRC_DIR="$ROOT/desktop/vd-backoffice"
OUT_APP="$BUILD_DIR/$APP_NAME.app"
DESKTOP_APP="$HOME/Desktop/$APP_NAME.app"

rm -rf "$OUT_APP"
mkdir -p "$OUT_APP/Contents/MacOS" "$OUT_APP/Contents/Resources" "$BUILD_DIR/src"

for file in "$SRC_DIR"/*.swift; do
  target="$BUILD_DIR/src/$(basename "$file")"
  sed "s#__REPO_ROOT__#${ROOT//\\/\\\\}#g" "$file" > "$target"
done

cat > "$OUT_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>fr</string>
  <key>CFBundleExecutable</key>
  <string>VD Backoffice</string>
  <key>CFBundleIdentifier</key>
  <string>com.vanilledesire.backoffice</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>VD Backoffice</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

xcrun swiftc \
  -target arm64-apple-macos13.0 \
  -framework SwiftUI \
  -framework AppKit \
  -framework WebKit \
  "$BUILD_DIR"/src/*.swift \
  -o "$OUT_APP/Contents/MacOS/VD Backoffice"

rm -rf "$DESKTOP_APP"
cp -R "$OUT_APP" "$DESKTOP_APP"
xattr -cr "$DESKTOP_APP"
codesign --force --deep --sign - "$DESKTOP_APP"

echo "Built app: $DESKTOP_APP"
