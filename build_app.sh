#!/bin/bash
echo "🔨 Building Sign Language Dictionary for macOS..."

# Clean previous build
rm -rf build dist *.spec

# Build without icon requirement
echo "🚀 Running PyInstaller with onedir mode..."

python3 -m PyInstaller \
    --windowed \
    --onedir \
    --name "SignLanguageDictionary" \
    --add-data "sign_themed.db:." \
    --add-data "images:images" \
    --hidden-import "PySide6.QtCore" \
    --hidden-import "PySide6.QtWidgets" \
    --hidden-import "PySide6.QtGui" \
    --hidden-import "sqlite3" \
    --osx-bundle-identifier "com.yourcompany.signlanguage" \
    main.py

# Check if build succeeded
if [ -d "dist/SignLanguageDictionary.app" ]; then
    echo ""
    echo "✅ Build successful!"
    echo "📦 App created at: dist/SignLanguageDictionary.app"
    echo ""
    echo "To open:"
    echo "  open dist/SignLanguageDictionary.app"
    echo ""
    echo "To install:"
    echo "  cp -r dist/SignLanguageDictionary.app /Applications/"
    echo ""
    echo "To run from terminal (to see errors):"
    echo "  ./dist/SignLanguageDictionary.app/Contents/MacOS/SignLanguageDictionary"
else
    echo "❌ Build failed."
fi
