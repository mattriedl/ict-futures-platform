# 04 — Scheduler & Autotrader

This document explains how automated ("auto") demo trades are placed and managed on a schedule, how the schedule is configured, and the redundancy design that keeps it running.

---

## 1. What the autotrader does

The autotrader runs a **cycle** that, on each invocation:

1. **Activates pending trades** — promotes queued/pending AUTO setups to active open trades.
2. **Evaluates open trades** — checks each OPEN demo trade against current live prices and resolves it to WIN / LOSS / closed when stop-loss or take-profit is hit.
3. **Runs auto-entry** — for every user with `autoTradeEnabled = true`, scans current setups and, if a setup's confluence score ≥ that user's `autoTradeMinScore` (default 70), opens a new AUTO demo trade sized by the user's `riskPercent` and leverage settings.

4. **Generates setup alerts** — `runAlertScan()` in `lib/alerts.ts` (see docs/01 → Alerts) and emails them when enabled.

Trades the bankroll can only cover at under 25% of the intended 1%-risk size are skipped rather than opened as dust positions.

The cycle logic lives in **`lib/autotrade.ts`** and is exposed through the API route **`app/api/demo/autotrade/route.ts`**.

> **Constraint honored:** the demo engine never resolves trades against synthetic/fabricated bars — evaluation uses real market data only. Live price is always sourced in real time, independent of any chart timeframe.

---

## 2. The autotrade endpoint

**`POST /api/demo/autotrade`** — runs one full cycle. **`GET /api/demo/autotrade`** — returns status/health.

### Authorization
The POST is protected by a shared secret, `AUTOTRADE_SECRET`. Supply it either way:
- Header: `x-autotrade-secret: <secret>`
- Query string: `?secret=<secret>`

If the secret is missing/wrong, the endpoint refuses the request. This lets the scheduler call it without a logged-in user session.

### Manual trigger (for testing)
```bash
curl -s -X POST "http://localhost:3456/api/demo/autotrade" \
  -H "x-autotrade-secret: $AUTOTRADE_SECRET"
```

---

## 3. Primary scheduler — Abacus platform Scheduled Task

On the Abacus VM the cycle is driven by a **platform Scheduled Task** named **"ICT Autotrader"**. It fires roughly hourly (around minute :19), curls the autotrade endpoint with the secret, and pipes the response into a helper, `/home/ubuntu/process_autotrade.py`, for logging/processing.

This is managed from the Abacus platform (Scheduled Tasks UI), **not** from inside the repo. When you migrate off the Abacus VM, this task does **not** come with you — you must recreate the schedule on the new host (see §4 and §5).

---

## 4. Local backstop — systemd timer (in-repo, portable)

To guarantee the cycle still runs if the platform task is unavailable (a 6-hour gap was observed once when relying on the platform task alone), the repo ships a **local systemd timer** under `deploy/`:

| File | Role |
|---|---|
| `deploy/ict-autotrade-local.sh` | Wrapper: reads `AUTOTRADE_SECRET` / `APP_PORT` from the app's `.env`, POSTs to the local autotrade endpoint, logs a one-line summary, exits non-zero on failure. Self-contained (no external helper script). |
| `deploy/ict-autotrade-local.service` | `oneshot` service that runs the wrapper. Replace `__RUN_USER__` / `__PROJECT_DIR__`. |
| `deploy/ict-autotrade-local.timer` | Fires at :19 and :49 every hour (every 5 min), `Persistent=true` so missed runs fire on boot. |

With the Abacus platform task gone, this timer is the scheduler.

### Install the local timer
```bash
cd /path/to/ict-futures-platform/deploy   # replace __RUN_USER__ / __PROJECT_DIR__ in the .service first
sudo cp ict-autotrade-local.service ict-autotrade-local.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ict-autotrade-local.timer
systemctl list-timers ict-autotrade-local.timer   # verify next run
```

> Before enabling, make sure `AUTOTRADE_SECRET` is readable by the wrapper (it reads from the app `.env`) and that `APP_PORT`/URL in the wrapper matches your deployment.

---

## 5. Recreating the schedule on a new server (plain cron)

If you are not using systemd, a cron entry is the simplest portable option. Example — run every 5 minutes:

```cron
*/5 * * * * curl -s -X POST "http://localhost:3456/api/demo/autotrade" -H "x-autotrade-secret: YOUR_SECRET" >> /var/log/ict-autotrade.log 2>&1
```

Edit with `crontab -e`. Replace `YOUR_SECRET` with the value of `AUTOTRADE_SECRET`, and adjust port/host to match your deployment. For redundancy you can add a second entry at a staggered minute.

---

## 6. Keeping it running (Always On)

- The app process itself must stay up (systemd service `ict-futures`, or your container). The scheduler only triggers the cycle; it does not start the app.
- On the Abacus VM, keep the VM **Always On** so both the app and the schedule run without interruption.
- A heartbeat watchdog pair also exists (`deploy/ict-futures-watchdog.timer` / `.service`) that can restart the app if it stops responding. It is optional and may be inactive; enable it the same way as the autotrade timer if you want self-healing.

---

## 7. Verifying it works

```bash
# Is the app up?
curl -s http://localhost:3456/api/demo/autotrade | head

# Is the local timer scheduled?
systemctl list-timers | grep ict-autotrade

# Recent autotrade activity in logs
journalctl -u ict-autotrade-local.service -n 50 --no-pager
```

If trades are not appearing: confirm at least one user has `autoTradeEnabled = true`, that setups are scoring at or above their `autoTradeMinScore`, that the market is open for the tracked instruments, and that `AUTOTRADE_SECRET` matches between the caller and the app.
