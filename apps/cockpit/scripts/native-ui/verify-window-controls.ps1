<#
.SYNOPSIS
  Drive the real title-bar window controls on Windows and assert the OS window state changed.

.DESCRIPTION
  Written for the Windows regression where minimize/maximize/close did nothing: the
  `data-tauri-drag-region` layer in TitleBar.tsx is `absolute inset-0`, so it painted above the
  statically-positioned Windows control cluster and absorbed every click. Nothing in vitest or the
  browser harness can see that — jsdom does no layout, and hit-testing is exactly what broke.

  Each check clicks a real button with synthetic input and then asserts against the OS
  (IsIconic / IsZoomed / window destroyed), not against the DOM. A click that the drag region
  swallows leaves the window state unchanged and fails here.

  The last two checks exercise the drag region itself. The fix works by *raising* the control
  cluster above that layer, so the thing most likely to be broken by it is dragging — these guard
  the trade.

  Run against a running app:
    bun run tauri dev
    pwsh -File scripts/native-ui/verify-window-controls.ps1

.PARAMETER SkipClose
  Skip the close check, which terminates the app.

.PARAMETER ShotDirectory
  Where to write a cropped screenshot for each failing check.

.PARAMETER ProcessName
  Override the process name (default `cockpit`, the dev binary; use `devdrivr` for a packaged build).
#>
[CmdletBinding()]
param(
  [switch]$SkipClose,
  [string]$ShotDirectory = (Join-Path ([IO.Path]::GetTempPath()) 'cockpit-native-ui'),
  [string]$ProcessName = $(if ($env:COCKPIT_PROC) { $env:COCKPIT_PROC } else { 'cockpit' })
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'native.psm1') -Force

$script:Results = [System.Collections.Generic.List[pscustomobject]]::new()

function Write-Step { param([string]$Text) Write-Host "  $Text" -ForegroundColor DarkGray }

function Add-Result {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][bool]$Passed,
    [string]$Detail = ''
  )
  $script:Results.Add([pscustomobject]@{ Name = $Name; Passed = $Passed; Detail = $Detail })
  if ($Passed) {
    Write-Host "  PASS  $Name" -ForegroundColor Green
  }
  else {
    Write-Host "  FAIL  $Name" -ForegroundColor Red
    if ($Detail) { Write-Host "        $Detail" -ForegroundColor Red }
  }
}

function Save-FailureShot {
  param([Parameter(Mandatory)][string]$Name)
  try {
    if (-not (Test-Path $ShotDirectory)) {
      New-Item -ItemType Directory -Path $ShotDirectory -Force | Out-Null
    }
    $window = Get-CockpitWindow -ProcessName $ProcessName
    $slug = ($Name -replace '[^\w]+', '-').Trim('-').ToLower()
    $path = Save-CockpitScreenshot -Window $window -Path (Join-Path $ShotDirectory "fail-$slug.png")
    Write-Step "screenshot: $path"
  }
  catch {
    Write-Step "screenshot unavailable: $($_.Exception.Message)"
  }
}

# -----------------------------------------------------------------------------------------------
# A check reads the window fresh, computes the target fresh, clicks, then waits for the OS state.
# Re-reading is not optional: the rect changes on every maximize, restore, and move, and a cached
# coordinate lands in empty space and produces a confident false failure.
# -----------------------------------------------------------------------------------------------
function Test-Control {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][ValidateSet('minimize', 'maximize', 'close', 'dragregion')][string]$Control,
    [Parameter(Mandatory)][ValidateSet('normal', 'minimized', 'maximized', 'gone')][string]$Expect,
    [int]$Clicks = 1,
    [int]$TimeoutMs = 4000
  )

  try {
    $window = Get-CockpitWindow -ProcessName $ProcessName
    $point = Get-CockpitControlPoint -Window $window -Control $Control
    [void](Assert-ControlPointIsClickable -Window $window -Point $point)

    $before = Get-CockpitWindowState -Window $window
    Write-Step "state=$before  click x$Clicks at $($point.X),$($point.Y)  (window $($window.X),$($window.Y) $($window.Width)x$($window.Height) scale=$($window.Scale))"

    # Every check here is a *transition*. If the window is already in the expected state, waiting
    # for that state succeeds without the control having done anything — a pass that means nothing.
    # This bit during development: with the fix reverted, "maximize restores the window" passed
    # while maximize was demonstrably broken, purely because the window had never left 'normal'.
    if ($before -eq $Expect) {
      Add-Result -Name $Name -Passed $false `
        -Detail "precondition not met: the window was already '$Expect' before the click, so no transition could be observed (the preceding check most likely failed)"
      return
    }

    Invoke-MouseClick -X $point.X -Y $point.Y -Count $Clicks

    $outcome = Wait-CockpitWindowState -State $Expect -TimeoutMs $TimeoutMs -ProcessName $ProcessName
    if ($outcome.Reached) {
      Add-Result -Name $Name -Passed $true
    }
    else {
      $hint = if ($outcome.State -eq $before) {
        "state never changed from '$before' — consistent with the drag-region layer absorbing the click"
      }
      else {
        "state went to '$($outcome.State)'"
      }
      Add-Result -Name $Name -Passed $false -Detail "expected '$Expect'; $hint"
      Save-FailureShot -Name $Name
    }
  }
  catch {
    Add-Result -Name $Name -Passed $false -Detail $_.Exception.Message
  }
}

function Reset-ToNormal {
  <#
    Return the window to a known normal, focused state using the OS directly, so a failure in one
    check cannot cascade into the next.
  #>
  try {
    $window = Get-CockpitWindow -ProcessName $ProcessName
    Restore-CockpitWindow -Window $window
    $window = Get-CockpitWindow -ProcessName $ProcessName
    if ($window.IsMaximized) {
      # No ShowWindow(SW_RESTORE) shortcut here: it is already un-minimized, so unmaximize needs a
      # second restore pass.
      [void][DevDrivr.Native]::ShowWindow($window.Handle, [DevDrivr.Native]::SW_RESTORE)
      Start-Sleep -Milliseconds 350
    }
    $window = Get-CockpitWindow -ProcessName $ProcessName
    if (-not $window.IsForeground) {
      Write-Warning 'Window is not in the foreground. Windows can refuse SetForegroundWindow from a background process; the first click may be consumed by activation. Click the app window once yourself and re-run.'
    }
    $window
  }
  catch {
    throw "Could not return the window to a normal state: $($_.Exception.Message)"
  }
}

# -----------------------------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------------------------

Write-Host ''
Write-Host 'Preflight' -ForegroundColor Cyan

try {
  $awareness = Initialize-DpiAwareness
  Write-Step "dpi awareness level: $awareness (0 would be fatal)"
}
catch {
  Write-Host "  ABORT  $($_.Exception.Message)" -ForegroundColor Red
  exit 2
}

try {
  [void](Set-DisplayAwake)
  Write-Step 'display held awake'
}
catch {
  Write-Step "could not hold the display awake: $($_.Exception.Message)"
}

try {
  [void](Test-SyntheticInput)
  Write-Step 'synthetic input verified against the desktop'
}
catch {
  # Everything downstream would report "the controls do nothing", which would be a lie.
  Write-Host "  ABORT  synthetic input is not reaching the desktop: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '         Run the app and this shell at the same integrity level, unlock the session, and dismiss any UAC prompt.' -ForegroundColor Red
  exit 2
}

try {
  $window = Get-CockpitWindow -ProcessName $ProcessName
}
catch {
  Write-Host "  ABORT  $($_.Exception.Message)" -ForegroundColor Red
  exit 2
}

Write-Step "window '$($window.Title)' pid=$($window.ProcessId) handle=$($window.Handle)"
Write-Step "rect $($window.X),$($window.Y) $($window.Width)x$($window.Height)  dpi=$($window.Dpi) scale=$($window.Scale)  dwmFrame=$($window.UsedDwmFrame)"

foreach ($control in 'minimize', 'maximize', 'close') {
  $point = Get-CockpitControlPoint -Window $window -Control $control
  try {
    [void](Assert-ControlPointIsClickable -Window $window -Point $point)
    Write-Step "target $control -> $($point.X),$($point.Y)"
  }
  catch {
    Write-Host "  ABORT  $($_.Exception.Message)" -ForegroundColor Red
    exit 2
  }
}

[void](Reset-ToNormal)

# -----------------------------------------------------------------------------------------------
# Checks
# -----------------------------------------------------------------------------------------------

Write-Host ''
Write-Host 'Window controls' -ForegroundColor Cyan

Test-Control -Name 'minimize button minimizes the window' -Control 'minimize' -Expect 'minimized'
[void](Reset-ToNormal)

Test-Control -Name 'maximize button maximizes the window' -Control 'maximize' -Expect 'maximized'
Test-Control -Name 'maximize button restores the window' -Control 'maximize' -Expect 'normal'
[void](Reset-ToNormal)

Write-Host ''
Write-Host 'Drag region (must survive raising the control cluster above it)' -ForegroundColor Cyan

Test-Control -Name 'double-click on the drag region maximizes' -Control 'dragregion' -Expect 'maximized' -Clicks 2
Test-Control -Name 'double-click on the drag region restores' -Control 'dragregion' -Expect 'normal' -Clicks 2
[void](Reset-ToNormal)

try {
  $window = Get-CockpitWindow -ProcessName $ProcessName
  $point = Get-CockpitControlPoint -Window $window -Control 'dragregion'
  $originX = $window.X
  $originY = $window.Y
  $deltaX = 120
  $deltaY = 60
  Write-Step "drag from $($point.X),$($point.Y) by +$deltaX,+$deltaY"
  Invoke-MouseDrag -FromX $point.X -FromY $point.Y -ToX ($point.X + $deltaX) -ToY ($point.Y + $deltaY)
  Start-Sleep -Milliseconds 400

  $moved = Get-CockpitWindow -ProcessName $ProcessName
  $movedX = $moved.X - $originX
  $movedY = $moved.Y - $originY
  # Tolerance rather than exactness: the compositor can land a pixel or two off, and snapping may
  # adjust the final position.
  $ok = ([math]::Abs($movedX - $deltaX) -le 8) -and ([math]::Abs($movedY - $deltaY) -le 8)
  if ($ok) {
    Add-Result -Name 'drag on the drag region moves the window' -Passed $true
  }
  else {
    Add-Result -Name 'drag on the drag region moves the window' -Passed $false `
      -Detail "expected +$deltaX,+$deltaY, observed +$movedX,+$movedY"
  }

  # Put it back so a rerun starts from a comparable position.
  Invoke-MouseDrag -FromX ($point.X + $deltaX) -FromY ($point.Y + $deltaY) -ToX $point.X -ToY $point.Y
}
catch {
  Add-Result -Name 'drag on the drag region moves the window' -Passed $false -Detail $_.Exception.Message
}

if ($SkipClose) {
  Write-Host ''
  Write-Host 'Skipping the close check (-SkipClose); the app is left running.' -ForegroundColor Yellow
}
else {
  Write-Host ''
  Write-Host 'Close (terminates the app — run last)' -ForegroundColor Cyan
  [void](Reset-ToNormal)
  Test-Control -Name 'close button closes the window' -Control 'close' -Expect 'gone' -TimeoutMs 6000
}

# -----------------------------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------------------------

$failed = @($script:Results | Where-Object { -not $_.Passed })
Write-Host ''
Write-Host ("{0} checks, {1} passed, {2} failed" -f $script:Results.Count,
  ($script:Results.Count - $failed.Count), $failed.Count) -ForegroundColor Cyan

if ($failed.Count -gt 0) {
  foreach ($result in $failed) { Write-Host "  FAIL  $($result.Name) — $($result.Detail)" -ForegroundColor Red }
  exit 1
}

Write-Host 'All window controls behave correctly.' -ForegroundColor Green
exit 0
