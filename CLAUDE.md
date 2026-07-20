# Polaris — working notes

Home-network visibility + security tool. Discovers every device on the LAN,
names them, maps the topology, and port-scans them for risky exposure.
Runs entirely on the user's Mac. No cloud, no telemetry.

> **The app is Polaris. The folder may still be named `iris`** — the app was
> renamed (the old name collided with a work app). The folder name is cosmetic
> and intentionally decoupled from the app identity.

## Commands

```bash
npm install        # one npm workspace: installs server + web together
npm run build      # compile server (tsc) + bundle dashboard (vite)
npm start          # PRODUCTION: one process serving API + UI on :4000
npm run dev        # DEV: API :4000 + Vite dashboard :5173, hot reload
npm test           # both workspaces: server (node:test) + web (vitest)
```

## How it runs day to day

It auto-starts at login as a macOS LaunchAgent **`com.polaris.dashboard`**
(`scripts/install-autostart.sh` → `scripts/polaris-start.sh`), running the lean
production build: **a single ~95MB Node process on http://127.0.0.1:4000**.

- **`./polaris` (repo root) is the start/stop switch:**
  `./polaris` (status) · `start` · `stop` · `restart` · `rebuild` · `logs` · `open`.
  It's the only control script — it wraps the `launchctl gui/$(id -u)/...`
  syntax. Never call `launchctl` directly.
- **Production is NOT hot-reload.** After changing code: **`./polaris rebuild`**
  (= `npm run build` + restart).
- **Don't run `scripts/polaris-start.sh` by hand** — it's the launchd wrapper.
  launchd already holds :4000, so a manual run hits `EADDRINUSE`. It now detects
  that and exits cleanly instead of throwing a stack trace that looks like a crash.
- Logs: `~/Library/Logs/polaris-dashboard.log` (+ `.err.log`)
- The UI also has **⏸ Pause** (stop scanning) and **⏻ Quit** (stop everything).
- New devices are auto port-scanned on arrival (`AUTOSCAN_NEW_DEVICES=0` to
  disable), and the finding is folded into the ntfy alert.

## Definition of done

No change is finished until all of these are true. Don't ask whether to do them
— they are the baseline, not an upsell.

1. **Tests.** Add or update tests for the behavior you changed. `npm test` passes.
2. **Docs.** Update `README.md` and this file if behavior, commands, env vars,
   file layout, or endpoints changed. A doc that describes a deleted script is a
   bug — grep for the old name before you call it done.
3. **Security.** Re-read the security posture below against your change. Any new
   route, input, or shell/network call gets validated at the boundary.
4. **Verify for real.** Build it and drive it (`./polaris rebuild`, then the
   browser or curl). Tests passing is not the same as the app working.
5. **Keep it lean.** No new dependency without a clear reason — see Conventions.
6. **Commit and push.** Every time, without being asked. Small, focused commits
   with a message that says why. Push to `origin`.

## Gotchas that have bitten before

- **`.env` is loaded by `server/src/env.ts`, imported FIRST in `index.ts`.**
  Modules read `process.env` at evaluation time, so that import must stay first.
  Before this existed, `.env` was silently ignored — ntfy never fired for days.
- **HTTP header values must be Latin-1.** `notify.ts` runs titles through
  `headerSafe()`; an emoji in a header throws and the notification dies
  silently. Device names come off the network, so it also strips CR/LF.
- **`SCAN_INTERVAL_MS` is validated.** A malformed value yields `NaN`, and
  `setInterval(NaN)` coerces to 0 → back-to-back scanning forever.
- **Browser caches the content-hashed bundle.** After a rebuild, hard-reload or
  append `?v=N`, or you'll debug stale JS.
- **Device identity:** `id` is the MAC, falling back to `ip:<addr>` when the MAC
  isn't in the ARP cache yet. That produces duplicate "ghost" rows, so
  `applyScan` sweeps `ip:` rows that duplicate a MAC row at the same IP.
- **DB is `data/polaris.sqlite`**, with a rename-migration chain from earlier
  names. Port-scan results persist on the device row (`open_ports`,
  `risk_count`, `last_portscan_at`) and never expire.
- Watch for **orphaned dev processes** after restarts (`lsof -nP -iTCP:4000`).

## Conventions

- **Prefer zero dependencies.** The mDNS, NetBIOS and .env parsers are all
  hand-rolled on purpose; node_modules size is a standing concern.
- Server tests use the **built-in `node:test`** runner; web uses **Vitest +
  Testing Library**. Node's runner isolates each file in its own process, which
  is how DB tests each get a clean `POLARIS_DATA_DIR`.
- Port-scan **risk rules live in `net/portscan.ts` (`riskFor`)** and are
  deliberately conservative — normal consumer ports (Chromecast 8008/8009/8443,
  IPP, Kasa 9999) must stay unflagged so a badge means something. There are
  tests asserting those stay clean.
- Verify UI changes by actually driving the app in a browser, not just tests.

## Security posture

Binds to loopback only, rejects non-loopback `Host` headers (DNS-rebinding
defense), and ships **no CORS** — the dashboard is same-origin. Port scans are
opt-in, per-device, and refuse to scan outside the local subnet.
