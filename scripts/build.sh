#!/bin/bash
# Builds build/Tidepool.app. Pass --run to (re)launch it afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."

swift build -c release
APP="build/Tidepool.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build -c release --show-bin-path)/Tidepool" "$APP/Contents/MacOS/Tidepool"
cp -R Wallpapers "$APP/Contents/Resources/Wallpapers"

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Tidepool</string>
    <key>CFBundleDisplayName</key><string>Tidepool</string>
    <key>CFBundleIdentifier</key><string>com.vishruth.tidepool</string>
    <key>CFBundleExecutable</key><string>Tidepool</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
    <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
EOF

codesign --force --sign - "$APP" >/dev/null 2>&1
echo "Built $APP"

if [[ "${1:-}" == "--run" ]]; then
    pkill -x Tidepool 2>/dev/null || true
    while pgrep -x Tidepool >/dev/null; do sleep 0.1; done  # opening while the old copy is quitting fails
    open "$APP"
fi
