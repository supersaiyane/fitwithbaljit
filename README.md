# Fit with Baljit — PWA

A phone/iPad app (installable, offline) for Baljit's 12-week vegetarian transformation.
Content is **template-driven** (edit `plan.json` → app updates). Progress is stored **on her device only**.

Live URL after deploy: `https://supersaiyane.github.io/fitwithbaljit/`

---

## 1. Deploy (GitHub Pages — free)

```bash
git clone https://github.com/supersaiyane/fitwithbaljit.git
# copy these files into the repo, then:
git add .
git commit -m "Fit with Baljit PWA"
git push
```

Then in the repo on GitHub: **Settings → Pages → Build and deployment → Source: “Deploy from a branch” → Branch: `main` / `/root` → Save.**
Wait ~1 minute; your app is live at the URL above.

> A PWA **must** be served over HTTPS for install + offline + push to work. GitHub Pages gives you HTTPS automatically. Opening `index.html` from disk will *not* enable install/offline.

## 2. Install on her device

Open the URL in **Safari (iPhone/iPad)** or **Chrome (Android)** → the app’s **“Add to home screen”** card walks her through it. On iOS this step is required for notifications.

---

## 3. Update the plan (the template-driven part)

Everything she sees comes from **`plan.json`**. To change content:

1. Edit `plan.json` (a meal, an exercise, a supplement, add days…).
2. **Bump the `version`** field (e.g. `1.0.0` → `1.0.1`).
3. Commit + push.

The installed app checks for updates on open (roughly twice a week — it compares `version`). Content changes apply silently; when you add **new days**, she sees a “Plan updated ✨” note. **Her ticks, weight and measurements are never touched by an update.**

### Add Week 3–4
Append new day objects to the `days` array (`"n": 15, 16, …`), reusing the same shape. `totals` can be recomputed or left approximate. Bump `version`. Done — no code change.

### Data shapes (quick reference)
- `days[]` → each has `slots[]` (water / meals with `p,c,f,kcal` / `supplements` / `pre` / `workout` / `post`) and `totals`.
- `supplements[]` → `{id, name, dose, when, freq:"daily"|"weekly", weekday?, optional?}`. `freq` drives the reminder engine.
- `waters{}`, `workouts{}`, `exercises[]` (video links), and the `dos/donts/eat/avoid/family` lists.

---

## 4. Notifications (OneSignal — low-maintenance push)

The app works fully **without** push (it shows “due / overdue” flags in-app). To add real reminders that fire while the app is closed:

1. Create a free account at **onesignal.com** → **New App/Website** → Web push.
2. Set the site URL to your GitHub Pages URL. OneSignal gives you an **App ID**.
3. In `index.html`, replace `YOUR_ONESIGNAL_APP_ID` with it. Commit + push.
4. OneSignal will ask you to add its two service-worker files (`OneSignalSDKWorker.js`) to the repo root — follow its wizard (copy-paste, one-time).
5. In the OneSignal dashboard → **Messages → Automated/Scheduled**, create recurring pushes on this schedule:

| Time | Days | Message |
|---|---|---|
| 6:30 AM | daily | Morning water (empty stomach) 💧 |
| 1:00 PM | daily | Lunch + lunch supplements 💊 |
| 4:00 PM | daily | Afternoon snack + Collagen Builder |
| 6:00 PM | daily | Workout time (or a walk) 🏋 |
| 8:00 PM | daily | Dinner + dinner supplements 💊 |
| 1:00 PM | Sundays | Weekly Vitamin D3 sachet 🗓 |

**How the “keep reminding until she checks it” works (2C design):**
- The **in-app** logic is the smart part: each supplement is “due” until she ticks it; weekly items (D3) auto-reschedule to the same day next week; overdue items stay flagged red every time she opens the app.
- The **OneSignal push** is the timed nudge that reaches her when the app is closed. It fires on the schedule above regardless of ticks (it doesn’t read her private on-device state) — the app handles the smart “stop when done”.
- **Off switch:** Settings → **Reminders** toggles everything; **Per-item reminders** turn individual pushes on/off. (Turning a per-item off hides its in-app due flag; to also stop its push, pause that message in OneSignal.)

### Honest caveat (iOS)
On iPhone/iPad, web-push only works if the app is **installed to the home screen** and permission is granted, and Apple may delay/throttle. Android is more reliable. That’s exactly why the **in-app due flags are the backbone** and push is the bonus layer.

---

## 5. Privacy & data
All progress (ticks, weight, measurements, reminder state) lives in the browser’s local storage **on her device**. Nothing is uploaded. **More → Export my data** saves a JSON backup. (The only thing OneSignal knows is an anonymous push token — not her tracker data.)

## 6. Files
```
index.html          app shell + SW/OneSignal registration
styles.css          styling (theme via CSS variables; a "Calm blue" theme is built in)
app.js              all logic: render, on-device progress, heartbeat sync, due engine
plan.json           ← the template. Edit this to change content.
manifest.json       app name/icon/colors
service-worker.js   offline cache + network-first plan.json
icons/              app icons
```

Not medical advice — a personal wellness tool. Get baseline bloodwork (Vit D, B12) before starting supplements.
