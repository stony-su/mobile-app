/* ════════════════════════════════════════════════════════════════
   Lull — native bridge. When packaged with Capacitor (APK / AAB)
   this talks to Android for real alarms and durable storage.
   On the plain web it all degrades to harmless no-ops, so the same
   code runs everywhere.
   ════════════════════════════════════════════════════════════════ */

const Cap = window.Capacitor;
export const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());

// plugins are exposed on Capacitor.Plugins at runtime — no bundler needed
const plugins = (isNative && Cap.Plugins) ? Cap.Plugins : {};
const LN = plugins.LocalNotifications || null;
const Prefs = plugins.Preferences || null;

const ALARM_ID = 1;            // we only keep one alarm slot
const CHANNEL = 'lull-alarm';

let tapHandler = null;         // set by the app; called when the alarm is tapped

/* ─────────────────────────── durable storage ───────────────────────────
   localStorage is the working store everywhere (sync, simple, and it does
   persist inside a Capacitor WebView). On native we also mirror to
   Preferences (Android SharedPreferences) so the journal survives even a
   WebView data-clear — that's the "stored inside the app" part. */
export const store = {
  // pull the durable copies into localStorage before the app reads them
  async hydrate(keys) {
    if (!Prefs) return;
    for (const key of keys) {
      try {
        const { value } = await Prefs.get({ key });
        if (value != null) localStorage.setItem(key, value);
      } catch (_) { /* first run, or unavailable */ }
    }
  },
  // write-through to the durable store (fire and forget)
  mirror(key, rawValue) {
    if (!Prefs) return;
    try { Prefs.set({ key, value: rawValue }); } catch (_) { /* best effort */ }
  },
};

/* ─────────────────────────── the alarm ─────────────────────────── */
export const native = {
  isNative,

  async init() {
    if (!LN) return;
    // a MAX-importance channel so the alarm makes sound & pops a heads-up
    try {
      if (LN.createChannel) {
        await LN.createChannel({
          id: CHANNEL,
          name: 'Alarm',
          description: 'Lull wake-up alarms',
          importance: 5,          // IMPORTANCE_HIGH → sound + heads-up
          visibility: 1,          // show on the lock screen
          sound: 'chimes',        // res/raw/chimes.wav
          vibration: true,
          lights: true,
        });
      }
      // when the alarm notification is tapped, the app opens here
      LN.addListener('localNotificationActionPerformed', (ev) => {
        const extra = ev && ev.notification && ev.notification.extra;
        if (extra && extra.kind === 'alarm' && tapHandler) tapHandler(extra);
      });
    } catch (_) { /* leave the web in-app alarm to carry on */ }
  },

  async ensurePermission() {
    if (!LN) return false;
    try {
      let perm = await LN.checkPermissions();
      if (perm.display !== 'granted') perm = await LN.requestPermissions();
      return perm.display === 'granted';
    } catch (_) { return false; }
  },

  // schedule a one-shot alarm at epoch-ms `at`
  async scheduleAlarm(at, { title = 'Lull', body = 'Time to wake — tap to open.' } = {}) {
    if (!LN) return false;
    if (!(await this.ensurePermission())) return false;
    await this.cancelAlarm();
    try {
      await LN.schedule({
        notifications: [{
          id: ALARM_ID,
          channelId: CHANNEL,
          title,
          body,
          schedule: { at: new Date(at), allowWhileIdle: true }, // fires through Doze
          sound: 'chimes',
          smallIcon: 'ic_stat_lull',
          autoCancel: true,
          extra: { kind: 'alarm', at },
        }],
      });
      return true;
    } catch (_) { return false; }
  },

  async cancelAlarm() {
    if (!LN) return;
    try { await LN.cancel({ notifications: [{ id: ALARM_ID }] }); } catch (_) { /* nothing queued */ }
  },

  onAlarmTapped(cb) { tapHandler = cb; },
};
