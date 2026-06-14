# Lull — a soft place to land 🌙

A cozy, candle-lit sleep companion that runs on the web and packages cleanly into an Android APK.

- **Tonight** — a warm clock, a greeting, and a tiny night journal where moods are moon phases.
- **Sounds** — rain, hearth, wind, crickets, shore and a velvet hum, all *synthesized live* with the Web Audio API. No recordings, no downloads, works in airplane mode. Includes a fade-out sleep timer.
- **Breathe** — 4·7·8, box, and long-sigh breathing with a glowing orb, optional sound + vibration cues.
- **Alarm** — a turnable wheel to set the time, a choice of live-synthesized ringtones (or bundle/upload your own mp3), and a gentle ringing screen with snooze. Rings while the app is open.

No build step, no dependencies. Plain HTML/CSS/JS as a PWA (offline-capable via service worker).

## Run it locally

Any static server works (modules + service workers need `http://`, not `file://`):

```sh
node tools/serve.mjs            # serves on http://localhost:4173
# or: npx serve .
# or: python -m http.server 4173
```

Open http://localhost:4173 — best viewed at phone width (DevTools device mode).

## Turn it into an APK

Three good routes, in order of effort:

### 1. PWABuilder (easiest — no Android SDK needed)
1. Host this folder anywhere with **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages — drag-and-drop works).
2. Go to **https://www.pwabuilder.com**, paste your URL.
3. Choose **Android → Generate package**. You get a signed `.apk`/`.aab` built on a Trusted Web Activity (TWA).
4. Sideload the APK or upload the AAB to the Play Store. Keep the generated `assetlinks.json` at `/.well-known/assetlinks.json` on your host so the app opens full-screen without browser chrome.

### 2. Bubblewrap CLI (same TWA, locally)
```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://your-host.example/manifest.webmanifest
bubblewrap build         # produces app-release-signed.apk
```

### 3. Capacitor (no hosting required — web assets ship inside the APK)
```sh
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init Lull com.example.lull --web-dir .
npx cap add android
npx cap copy
npx cap open android     # then Build > Build APK in Android Studio
```

Notes for Android packaging:
- Icons are already provided in the required flavors (`any` + `maskable`).
- `display: standalone` + `orientation: portrait` are set in the manifest.
- The vibration cues in Breathe work in TWA/Capacitor builds out of the box.

## Regenerating the icons

The crescent-moon icons are rendered by a dependency-free Node rasterizer:

```sh
node tools/make-icons.mjs
```
