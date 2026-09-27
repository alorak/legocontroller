# Architecture

The app intentionally stays build-free: plain HTML, CSS and classic browser scripts are served directly by GitHub Pages and cached by the service worker.

## Runtime layers

- `index.html`: semantic application shell and modals.
- `styles.css`: application styling.
- `js/i18n.js`: English/Turkish translations and language rendering.
- `js/ui-preferences.js`: persistent UI preferences such as language/log-panel state.
- `js/protocol-controller.js`: controller message IDs, packet builders/parsers and shared command primitives.
- `js/device-ui.js`: generic device views and device-specific panel definitions.
- `js/bluetooth-devices.js`: device discovery, Web Bluetooth connection/reconnection and device cards.
- `js/protocol-lwp3.js`: LEGO Wireless Protocol 3 message handling.
- `js/hub-ui.js`: hub/port rendering and hub controls.
- `js/protocol-spike.js`: SPIKE App 3 protocol, program upload/run and SPIKE motor command generation.
- `js/dashboard.js`: dashboards, metrics, widgets, drag/drop and dashboard persistence.
- `js/gamepad.js`: gamepad configuration, actions and keyboard/pointer input.
- `js/bootstrap.js`: final application wiring/startup.
- `pwa.js`: install prompt, network status and service-worker update UX.
- `service-worker.js`: offline application-shell cache.

Scripts are loaded in dependency order as classic deferred scripts. The split preserves the previous execution order and shared global lexical environment, so no npm package, bundler or remote runtime is required.

## Core review notes

The major single-file maintenance risk is now reduced substantially. Remaining architectural risks:

1. Feature scripts still share global mutable device/session state. The next structural step would be an explicit application state/store layer.
2. Inline HTML event handlers remain. Delegated listeners would clarify ownership and make a strict Content Security Policy practical.
3. Bluetooth encoders/parsers still lack packet-fixture tests. Protocol fixtures are the highest-value automated tests that do not require physical hardware.
4. localStorage persistence is feature-owned rather than routed through a centralized migration API; schema evolution should eventually use explicit migrations.
5. Service-worker cache revisioning remains explicit; app-shell changes must bump the cache identifier.
6. Real hardware remains necessary for final integration smoke tests because browser Web Bluetooth behavior cannot be fully validated statically.

This refactor is deliberately conservative: source order and application logic are preserved while ownership boundaries become visible.
