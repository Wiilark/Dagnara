# Dagnara Expo Keep-Alive supervisor.
#
# Why: bare `npx expo start --tunnel` drops dead on idle-tunnel timeouts,
# laptop sleep, and the rare Metro hang. Symptoms look like "server is off"
# even when the node process is alive but the ngrok tunnel is unresponsive.
#
# This script:
#   1. Blocks system sleep while running   (SetThreadExecutionState)
#   2. Verifies the 3 Expo tunnel patches  (re-flag if npm install wiped them)
#   3. Kills any stale Metro on :8081      (so we own the port cleanly)
#   4. Tunnel-health-checks every 90s      (kills Metro on timeout -> auto-restart)
#   5. Auto-restarts Expo on exit          (process death or supervisor kill)
#
# Run via start-dagnara.bat (visible window). Ctrl+C in window -> close.

$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Wilark\Desktop\DAGNARA\DagnaraApp'

# ── Sleep prevention ──────────────────────────────────────────────────────────
# ES_CONTINUOUS (0x80000000) keeps the flag set until thread exits or clears it.
# ES_SYSTEM_REQUIRED (0x00000001) blocks system idle sleep. Display is allowed
# to turn off (less invasive than ES_DISPLAY_REQUIRED).
$sig = @"
[DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
"@
$pk = Add-Type -MemberDefinition $sig -Name 'PowerKA' -Namespace 'DagnaraWin32' -PassThru
[void]$pk::SetThreadExecutionState([uint32]'0x80000001')
Write-Host "[keepalive] Sleep prevention armed (system idle blocked, display allowed)." -ForegroundColor Green

# ── Patch verification ────────────────────────────────────────────────────────
$ngrokFile  = 'node_modules\expo\node_modules\@expo\cli\build\src\start\server\AsyncNgrok.js'
$manifFile  = 'node_modules\expo\node_modules\@expo\cli\build\src\start\server\middleware\ManifestMiddleware.js'
$pAuth = (Test-Path $ngrokFile) -and (Select-String -Path $ngrokFile -Pattern '3Az8FJ16'              -SimpleMatch -Quiet)
$pConn = (Test-Path $ngrokFile) -and (Select-String -Path $ngrokFile -Pattern 'PATCHED: free-tier'    -SimpleMatch -Quiet)
$pUA   = (Test-Path $manifFile) -and (Select-String -Path $manifFile -Pattern 'CFNetwork'             -SimpleMatch -Quiet)
if ($pAuth -and $pConn -and $pUA) {
  Write-Host "[keepalive] All 3 tunnel patches present." -ForegroundColor Green
} else {
  Write-Host "[keepalive] WARNING: tunnel patches missing." -ForegroundColor Yellow
  Write-Host "  authToken=$pAuth | connectionProps=$pConn | UA-bypass=$pUA"
  Write-Host "  Re-apply per memory/feedback_start_app.md before tunnel-mode use."
}

# ── Kill stale Metro on 8081 (own the port) ───────────────────────────────────
$stale = Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue
foreach ($c in $stale) {
  try {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
    Write-Host "[keepalive] Killed stale PID $($c.OwningProcess) on :8081" -ForegroundColor Yellow
  } catch {}
}

# ── Tunnel health watchdog (background job) ───────────────────────────────────
# Pings the tunnel manifest with Expo Go UA every 90s. If it times out twice in
# a row, kills the foreground Metro on :8081 — supervisor loop then restarts.
# Two-strike rule avoids restart loops on transient ngrok blips.
$watchdog = Start-Job -ScriptBlock {
  $url = 'https://moveless-phosphorous-buena.ngrok-free.dev/'
  $hdrs = @{
    'User-Agent'     = 'Expo/2.32.20 CFNetwork/1410.0.3 Darwin/22.6.0'
    'expo-platform'  = 'ios'
  }
  $fails = 0
  Start-Sleep -Seconds 60   # let Expo come up first
  while ($true) {
    try {
      $null = Invoke-WebRequest -Uri $url -Headers $hdrs -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
      $fails = 0
    } catch {
      $fails++
      Write-Output "[watchdog] tunnel probe failed ($fails/2): $($_.Exception.Message)"
      if ($fails -ge 2) {
        Write-Output "[watchdog] killing Metro on :8081 to force restart"
        $conns = Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue
        foreach ($c in $conns) {
          try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } catch {}
        }
        $fails = 0
        Start-Sleep -Seconds 30  # wait for supervisor to relaunch
      }
    }
    Start-Sleep -Seconds 90
  }
}
Write-Host "[keepalive] Tunnel watchdog started (job id $($watchdog.Id), 90s interval)." -ForegroundColor Green

# Trap Ctrl+C / window close so we kill the watchdog before exiting.
$cleanup = {
  Write-Host "[keepalive] Shutting down watchdog..." -ForegroundColor Yellow
  Stop-Job -Job $watchdog -ErrorAction SilentlyContinue
  Remove-Job -Job $watchdog -ErrorAction SilentlyContinue
}
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action $cleanup | Out-Null

# ── Supervisor loop ───────────────────────────────────────────────────────────
$n = 0
while ($true) {
  Write-Host ""
  Write-Host "[keepalive] >>> starting expo --tunnel (run #$n) <<<" -ForegroundColor Cyan
  Write-Host ""

  # Drain any watchdog output that piled up
  Receive-Job -Job $watchdog -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }

  npx expo start --tunnel
  $code = $LASTEXITCODE
  $n++

  Write-Host ""
  Write-Host "[keepalive] expo exited (code $code). Restarting in 5s. Close window to fully stop." -ForegroundColor Yellow
  Start-Sleep -Seconds 5
}
