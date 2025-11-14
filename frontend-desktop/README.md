# Nexus Desktop

Desktop application of Nexus using Electron.

## 🚀 Technologies

- **Electron** - Framework for desktop applications
- **Electron Store** - Local data persistence
- **Electron Builder** - Build and packaging

## 📦 Installation

```bash
cd frontend-desktop
npm install
```

## 🏃 Running

### Development

To run in development mode (uses the Vite dev server at http://localhost:3000):

```bash
# 1. First, start the web frontend
cd ../frontend-web
npm run dev

# 2. In another terminal, start Electron
cd ../frontend-desktop
npm run dev
```

### Production

To run the production version:

```bash
# 1. Build the web frontend
cd ../frontend-web
npm run build

# 2. Copy the built files
cp -r dist ../frontend-desktop/renderer

# 3. Start Electron
cd ../frontend-desktop
npm start
```

## 📦 Build

To create distributable executables:

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux

# All platforms
npm run build
```

Executables will be created in the `dist/` folder.

## 🎯 Features

- ✅ Cross-platform native application (Windows, macOS, Linux)
- ✅ Local storage with Electron Store
- ✅ Native application menu
- ✅ Keyboard shortcuts
- ✅ Auto-updates (can be implemented)
- ✅ Tray icon (can be implemented)
- ✅ Native notifications (can be implemented)

## 📁 Structure

```
frontend-desktop/
├── main.js           # Electron main process
├── preload.js        # Preload script
├── renderer/         # Built web frontend
├── assets/           # Icons and resources
└── package.json
```

## 🔧 Scripts

- `npm start` - Starts Electron (production)
- `npm run dev` - Starts Electron (development)
- `npm run build` - Build for all platforms
- `npm run build:win` - Build for Windows
- `npm run build:mac` - Build for macOS
- `npm run build:linux` - Build for Linux
