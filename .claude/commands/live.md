---
description: Bring the Dagnara Expo dev server live on LAN for Expo Go (detached, survives the session)
---

Make the app live in Expo Go. This is the ONE method that works — do not diagnose, explain, or try alternatives. Run it, confirm 200, say "ON", done.

```powershell
# 1. Free port 8081
$pids = (Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique
foreach ($p in $pids) { try { Stop-Process -Id $p -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 2
# 2. Launch detached via Task Scheduler so it survives the Claude session
$action = "cmd /c cd /d C:\Users\Wilark\Desktop\DAGNARA\DagnaraApp && npx expo start --lan --port 8081 >> %TEMP%\dagnara-expo.log 2>&1"
schtasks /Create /TN "DagnaraExpoNow" /TR $action /SC ONCE /ST 00:00 /F /RL LIMITED | Out-Null
schtasks /Run /TN "DagnaraExpoNow" | Out-Null
```

Then wait ~50s and verify BOTH:
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/status` → expect `200`
- Full bundle: `curl ...entry.bundle?platform=android&dev=true&minify=false` → expect HTTP 200, ~11.5MB. A 200 status but 500 bundle means a resolution error — if it mentions a stale module (e.g. `call-bind`), relaunch with `--clear` once.

If the bundle 500s with `Unable to resolve module`, the running Metro has a stale in-memory file map (it doesn't watch node_modules). Fix: relaunch the task action with `--clear` appended, ONE time, then drop `--clear` for the steady-state task.

Notes:
- LAN IP changes (DHCP). Rediscover: `Get-NetIPAddress -AddressFamily IPv4 | ? { $_.IPAddress -like '192.168.*' }`. Metro binds localhost too — verify via localhost to avoid false negatives on a stale IP.
- Expo Go has NO manual-URL box; a fresh Metro start broadcasts on LAN → appears in "Development servers". If not within ~20s, user pull-to-refreshes Expo Go home.
- Do NOT use `run_in_background` expo or `wscript` — both get reaped with the session. Only `schtasks` truly detaches.

End by confirming the owning PID is a detached `node` process (not this shell) and the task state is `Running`.
