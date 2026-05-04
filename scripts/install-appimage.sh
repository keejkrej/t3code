#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
SOURCE_APPIMAGE="/home/jack/workspace/t3code/release/T3-Code-0.0.21-arm64.AppImage"
APP_NAME="T3-Code"
DESKTOP_ID="t3code"
# --------------

TARGET_DIR="$HOME/.local/bin"
APPIMAGE_NAME="${APP_NAME}.AppImage"
DEST="$TARGET_DIR/$APPIMAGE_NAME"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP_DIR="$HOME/.local/share/applications"

mkdir -p "$TARGET_DIR" "$ICON_DIR" "$DESKTOP_DIR"

echo "Copying AppImage..."
cp -f "$SOURCE_APPIMAGE" "$DEST"
chmod +x "$DEST"

echo "Creating .desktop entry..."
cat > "$DESKTOP_DIR/${DESKTOP_ID}.desktop" <<EOF
[Desktop Entry]
Name=T3 Code
Comment=Minimal web GUI for coding agents
Exec=$DEST --no-sandbox %U
Type=Application
Terminal=false
Categories=Development;
StartupNotify=true
Icon=$DESKTOP_ID
EOF

# Try to extract the icon from the AppImage if possible
echo "Extracting icon..."
TMPDIR=$(mktemp -d)
cd "$TMPDIR"
if "$DEST" --appimage-extract >/dev/null 2>&1; then
  SQUASH_DIR="$TMPDIR/squashfs-root"
  if [ -d "$SQUASH_DIR" ]; then
    ICON_SRC=$(find "$SQUASH_DIR" -maxdepth 2 \( -name '*.png' -o -name '*.svg' \) | grep -i 'icon' | head -n 1 || true)
    if [ -n "$ICON_SRC" ]; then
      EXT="${ICON_SRC##*.}"
      cp -f "$ICON_SRC" "$ICON_DIR/${DESKTOP_ID}.$EXT"
    fi
    rm -rf "$SQUASH_DIR"
  fi
else
  echo "Skipping icon extraction (AppImage extract not available)."
fi
cd - >/dev/null

echo "Updating desktop database..."
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo ""
echo "Done. You can now launch T3 Code with:"
echo "  $DEST"
echo "Or search 'T3 Code' in your app launcher."
