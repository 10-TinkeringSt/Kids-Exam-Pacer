# Kids Exam Pacing Timer (PWA)

A distraction-free, watch-only exam pacing timer. Dark background, bright green
for time remaining, bright red revealed as time is consumed, with fixed
question-count reference ticks around the rim.

## Files
- `index.html` — markup only (setup screen, dial, done state)
- `styles.css` — all styling
- `app.js` — all timer/dial/wake-lock logic
- `manifest.json` — makes it installable as a home-screen app
- `service-worker.js` — makes it work fully offline after first load
- `staticwebapp.config.json` — Azure Static Web Apps routing/MIME config
- `icon-192.png`, `icon-512.png` — app icons

## How it works
1. Enter exam length (minutes) and number of questions, tap OK.
2. The dial appears greyed out with a GO button.
3. Tap GO to start — the dial comes alive and counts down.
4. A soft triple-beep (plus vibration on supported phones) plays when time is up.
5. Stop button available any time to break out early.
6. Screen is kept awake while the timer runs (where the browser supports it).

## Deploying to Azure Static Web Apps
1. Push this repo to GitHub (Azure SWA deploys from a GitHub — or Azure DevOps — repo).
2. In the Azure Portal, create a new **Static Web App** resource, plan type **Free**.
3. Connect it to this GitHub repo/branch. Leave the build presets as "Custom" —
   there's no build step: set **App location** to `/`, **Output location** to
   empty (or `/`), and no API location.
4. Azure adds a GitHub Actions workflow to the repo automatically and deploys
   on every push to the selected branch. You'll get a `*.azurestaticapps.net`
   URL immediately; a custom domain can be attached free from the resource's
   "Custom domains" tab.
5. `staticwebapp.config.json` (already in this repo) tells Azure not to rewrite
   requests for `styles.css`, `app.js`, `manifest.json`, `service-worker.js`,
   or the icons back to `index.html`.

Netlify Drop or GitHub Pages work too if you'd rather not use Azure — this is
a static site with no server-side code, so any static host is fine.

## Notes / known limitations
- Screen Wake Lock works on Chrome (Android) and Safari 17.4+ (iOS). On older
  browsers without support, a small note appears reminding you the screen may
  dim — this is a browser/OS limit, not fixable from a web page.
- All state resets if the page is closed mid-timer (no persistence yet) —
  fine for the current "watch only, single session" design.
- No sound file is bundled — the beep is synthesized in-browser, so there's
  nothing to go missing or fail to load offline.
