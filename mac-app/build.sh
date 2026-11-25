#!/bin/zsh
# Builds "TC Quoting Estimate.app" and installs it in /Applications (or ~/Applications).
# The app does NOT bundle the web app: it runs the one in this repo folder (where the database and backups
# live), so re-running npm run setup / npm run update is enough after code changes. Re-run this script only
# if the repo folder moves, node moves, or mac-app/*.swift changes.
set -e
HERE="${0:A:h}"
ROOT="${HERE:h}"
BUILD="$HERE/build"
NAME="TC Quoting Estimate"
APP="$BUILD/$NAME.app"
NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node not found on PATH"; exit 1; }
rm -rf "$BUILD"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O "$HERE/main.swift" -o "$APP/Contents/MacOS/$NAME" -framework Cocoa -framework WebKit

# icon
ICONSET="$BUILD/AppIcon.iconset"; mkdir -p "$ICONSET"
swift "$HERE/make-icon.swift" "$ROOT/public/logo.svg" "$BUILD/icon-1024.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$BUILD/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s*2)); sips -z $d $d "$BUILD/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>com.brainscadbrain.app</string>
  <key>CFBundleExecutable</key><string>$NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>$(git -C "$ROOT" rev-parse --short=7 HEAD 2>/dev/null || echo 1)</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.business</string>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSLocalNetworkUsageDescription</key><string>TC Quoting Estimate shares the app with phones and computers on your office Wi-Fi.</string>
  <key>BCBRoot</key><string>$ROOT</string>
  <key>BCBNode</key><string>$NODE</string>
</dict></plist>
PLIST

codesign --force --deep -s - "$APP"

DEST="/Applications"
[ -w "$DEST" ] || DEST="$HOME/Applications"
mkdir -p "$DEST"
rm -rf "$DEST/$NAME.app"
# The app used to be called "Brains Cad Brain": quit and remove the old copy so only one is installed.
OLD_NAME="Brains Cad Brain"
if pgrep -x "$OLD_NAME" >/dev/null 2>&1; then
  osascript -e "tell application \"$OLD_NAME\" to quit" >/dev/null 2>&1 || true
  sleep 2
  pkill -x "$OLD_NAME" >/dev/null 2>&1 || true
fi
for d in /Applications "$HOME/Applications"; do
  if [ -d "$d/$OLD_NAME.app" ]; then rm -rf "$d/$OLD_NAME.app"; echo "Removed old app: $d/$OLD_NAME.app"; fi
done
cp -R "$APP" "$DEST/"
echo "Installed: $DEST/$NAME.app"
