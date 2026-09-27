# Offline and GitHub Pages

The application itself has no runtime CDN, remote font, HTTP API, XHR, WebSocket, or package-manager dependency.

- The first GitHub Pages visit needs Internet access.
- The service worker precaches the local application shell.
- Device artwork is loaded from `https://blockcode.alorak.com/img/` to keep the same visuals as BlockCode.
- During service-worker installation, BlockCode artwork is cached with `no-cors` requests for later offline use.
- Matching local SVG files remain bundled as a fallback if BlockCode artwork cannot be loaded.
- Later visits can load the UI without Internet access once the service worker has completed installation.
- Settings and dashboards are stored in browser `localStorage`.
- Bluetooth traffic stays local through Web Bluetooth.

Web Bluetooth requires a supported browser and a secure context. GitHub Pages provides HTTPS.
All local runtime paths are relative, so project-site hosting under `/legocontroller/` works.
