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

## Turn it into an APK / AAB

**Use Capacitor.** It ships the web assets inside the app *and* gives the alarm
real native scheduling — a notification that fires with sound and vibration even
when the app is closed and the phone is asleep. (TWA routes like PWABuilder /
Bubblewrap can't do background alarms — see the note at the end.)

The repo already includes `package.json`, `capacitor.config.json`, a native
bridge (`js/native.js`), and helper scripts. Build it like this:

```sh
# 0. tools you need: Node, Android Studio (with an SDK + a device/emulator)
npm install                      # pulls Capacitor + the two plugins

npm run android:add              # copies web assets → www/, then `cap add android`
npm run alarm-sound              # writes the alarm tone to res/raw/chimes.wav
npm run android:sync             # re-copies www/ and syncs native projects
npm run android:open             # opens Android Studio → Build > Build APK / AAB
```

After editing any web file later, just `npm run android:sync` again.

**Permissions** — add these to `android/app/src/main/AndroidManifest.xml` (inside
`<manifest>`, above `<application>`) so the alarm can fire exactly, on time:

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.USE_EXACT_ALARM" />
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

On first run the app asks for notification permission. On Android 12+, exact
alarms are allowed for clock-style apps via `USE_EXACT_ALARM`.

How the alarm behaves once packaged:
- **App closed / phone asleep** → the scheduled notification rings with
  `res/raw/chimes.wav` on the high-importance "Alarm" channel and wakes the
  screen. Tapping it opens Lull straight into the full ringing screen.
- **App open** → the in-app ring overlay plays your chosen (synthesized)
  ringtone on a loop with dismiss / snooze, as on the web.
- Journal + history are mirrored to native **Preferences** (Android
  SharedPreferences), so your moons survive even if the WebView data is cleared.

Want a different default alarm tone? Drop any `chimes.wav` into
`android/app/src/main/res/raw/` (lower-case, no spaces) — it overrides the
generated one. For a *louder, looping, full-screen* alarm (a real alarm-clock
foreground service), you'd add a small custom Capacitor plugin around
`AlarmManager.setAlarmClock()`; the notification route above is the
zero-native-code default and is plenty for most.

Notes:
- Icons are already provided in the required flavors (`any` + `maskable`).
- `display: standalone` + `orientation: portrait` are set in the manifest.
- Vibration (Breathe + the alarm) works in Capacitor builds out of the box.

### Alternative: TWA (PWABuilder / Bubblewrap)
Fine if you don't need the background alarm. Host this folder over **HTTPS**,
then either paste the URL into **https://www.pwabuilder.com** (Android → Generate
package) or run Bubblewrap locally:

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://your-host.example/manifest.webmanifest
bubblewrap build
```

Caveat: in a TWA the alarm only rings while the app is open (it's plain Chrome
under the hood, with no native scheduling).

## Regenerating the icons

The crescent-moon icons are rendered by a dependency-free Node rasterizer:

```sh
node tools/make-icons.mjs
```
