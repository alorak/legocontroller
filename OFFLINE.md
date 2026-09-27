# Offline and GitHub Pages

This app has no runtime CDN, remote font, HTTP API, XHR, WebSocket, or package-manager dependency.

- First GitHub Pages visit needs Internet access.
- The service worker precaches the app shell and all UI assets.
- Later visits can load the UI with no Internet connection.
- Settings and dashboards are stored in localStorage.
- Bluetooth traffic stays local through Web Bluetooth.

Web Bluetooth requires a supported browser and secure context. GitHub Pages provides HTTPS.
All runtime paths are relative, so /legocontroller/ project hosting works.
