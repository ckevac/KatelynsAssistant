# Katelyn's School Assistant

A one-stop-shop school app: weekly schedule (from the Day 1–5 cycle), a
Today view, assignment/reminder tracking, and a calendar for long-term
planning. Runs as a free static site on GitHub Pages, installable to
the home screen on iPhone and as an app on a Chromebook.

## How it's built (and why)

- **Frontend**: plain HTML/CSS/JS, no build step — just files GitHub
  Pages serves directly.
- **Sign-in**: a passcode Katelyn sets herself. Her school Google
  account can't be used for this — Durham District School Board blocks
  third-party sign-in for student accounts entirely (confirmed via
  testing), so this sidesteps that completely.
- **Data**: your existing Google Sheet stays the source of truth for
  the weekly schedule. A small Google Apps Script (deployed under
  *your* Google account, not Katelyn's) reads/writes the sheet and
  exposes it as a simple private API. Because it runs under your
  authority, Katelyn's device never needs to sign in to Google at all
  — it just makes plain web requests, which is invisible to the
  district's policy.
- **The day-cycle calendar** (which date is Day 1 vs Day 2, etc., and
  which days have no school) is a static file generated from the DDSB
  calendar PDF you sent. It'll need regenerating each school year —
  see "Yearly maintenance" below.

## One-time setup

### 1. Deploy the backend (Apps Script)

1. Open your schedule Google Sheet.
2. Extensions → Apps Script.
3. Delete any starter code, and paste in the contents of
   `apps-script/Code.gs` from this repo.
4. Near the top, change `PASSCODE_TO_SET` to whatever passcode you and
   Katelyn want to use.
5. In the function dropdown (top toolbar), choose **setPasscode**, then
   click **Run**. Approve the permissions prompt (this is you
   authorizing your own script — a one-time thing, unrelated to the
   district policy issue). Check the execution log at the bottom for
   confirmation.
6. Deploy → New deployment → gear icon → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click Deploy, authorize again if asked, and copy the **/exec URL**
   it gives you.

Any time you change `Code.gs` later, use Deploy → Manage deployments →
edit (pencil icon) → New version, so the same URL picks up the change.

### 2. Point the frontend at it

Edit `js/config.js` in this repo and paste that URL in:

```js
const APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
};
```

### 3. Turn on GitHub Pages

Repo Settings → Pages → Source: **Deploy from a branch** → Branch:
`main`, folder `/ (root)` → Save. Your app will be live at:

```
https://ckevac.github.io/KatelynsAssistant/
```

### 4. Install it on Katelyn's devices

- **iPhone (Safari)**: open the link → Share → **Add to Home Screen**.
- **Chromebook (Chrome)**: open the link → menu (⋮) → **Install app** (or
  the install icon in the address bar).

Either way it opens full-screen, like a real app, and works offline
for anything already loaded (schedule/assignments are cached locally
between refreshes).

### 5. You can delete `oauth-test.html`

It was only for testing the (ultimately blocked) Google sign-in path —
no longer needed.

## Yearly maintenance

Two things will need a small update at the start of each school year:

1. **The schedule** — just edit the Google Sheet directly; the app
   reads it live, no redeploy needed.
2. **The day-cycle calendar** — when the district publishes next
   year's calendar PDF, send it over and I'll regenerate
   `data/day-cycle-2026-2027.json` (or hand you the steps to do it
   yourself).

## Project structure

```
index.html               App shell (all screens)
css/styles.css            Design system
js/config.js              Your Apps Script URL goes here
js/api.js                 Talks to the backend
js/app.js                 App logic, rendering, state
manifest.json             PWA install metadata
service-worker.js         Offline app-shell caching
data/day-cycle-2026-2027.json   Date → school-day-cycle lookup
apps-script/Code.gs        Backend — paste into the Sheet's Apps Script editor (not deployed via GitHub Pages)
```
