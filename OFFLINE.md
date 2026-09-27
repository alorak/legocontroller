# Offline and GitHub Pages

The application code has no runtime package-manager, remote font, HTTP API, XHR or WebSocket dependency.

- The first GitHub Pages visit needs Internet access so the app shell and service worker can be installed.
- HTML, CSS, JavaScript, the manifest, PWA icons and local SVG fallbacks are precached.
- Device artwork uses the same PNG files as BlockCode and is cached during service-worker installation.
- If BlockCode artwork is unavailable, the UI automatically falls back to the bundled local SVG version.
- Later visits can load the application shell and cached artwork without Internet access.
- An in-app status pill shows the browser online/offline state.
- When a new service worker is ready, the app shows a refresh prompt instead of silently replacing the running version.
- Settings, dashboards and gamepad mappings stay in browser localStorage.
- Bluetooth traffic stays local through Web Bluetooth.
- Legacy Powered Up Remote Controller 88010 uses a broad Web Bluetooth chooser, matching BlockCode's generic scan behavior, and is validated via LWP3 service 1623 after selection.

Web Bluetooth still requires a supported browser and secure context. GitHub Pages provides HTTPS.
All runtime paths are relative, so project-site hosting under /legocontroller/ is supported.
