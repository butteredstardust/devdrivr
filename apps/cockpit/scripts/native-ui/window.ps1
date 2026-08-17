<#
.SYNOPSIS
  Window inspection helpers for native-UI debugging on Windows. Counterpart to window.sh.

.DESCRIPTION
  ./window.ps1 bounds          # x y w h of the app window (physical px, top-left origin)
  ./window.ps1 raw             # GetWindowRect vs. the DWM frame, to spot an invisible border
  ./window.ps1 dpi             # dpi and scale factor for the window's monitor
  ./window.ps1 state           # normal | minimized | maximized
  ./window.ps1 minimized       # true | false
  ./window.ps1 maximized       # true | false
  ./window.ps1 titlebar        # x y w h of the 44 CSS px title strip, scaled
  ./window.ps1 button <name>   # x y of minimize | maximize | close | dragregion
  ./window.ps1 buttons         # all four target points, with clickability checked
  ./window.ps1 frontmost       # process name owning the foreground window
  ./window.ps1 shot [file]     # screenshot cropped to the window, scaled to 1200px wide
  ./window.ps1 awake           # hold the display on (lasts only while this shell runs)
  ./window.ps1 info            # everything above in one object

  COCKPIT_PROC overrides the process name for a packaged build:
    $env:COCKPIT_PROC = 'devdrivr'; ./window.ps1 bounds

  The process is `cockpit` (the Cargo package name); `devdrivr` is the *window title* and also
  appears in editor window titles, so matching on it can find a completely unrelated window.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command,
  [Parameter(Position = 1)][string]$Argument
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'native.psm1') -Force

function Show-Usage {
  (Get-Help -Full $PSCommandPath).Description.Text
  exit 2
}

switch ($Command) {
  'bounds' {
    $w = Get-CockpitWindow
    "$($w.X) $($w.Y) $($w.Width) $($w.Height)"
  }
  'raw' {
    $w = Get-CockpitWindow
    "GetWindowRect: $($w.WindowRect)"
    "DWM frame:     $($w.X) $($w.Y) $($w.Width) $($w.Height)  (used: $($w.UsedDwmFrame))"
  }
  'dpi' {
    $w = Get-CockpitWindow
    "dpi=$($w.Dpi) scale=$($w.Scale)"
  }
  'state' { Get-CockpitWindowState -Window (Get-CockpitWindow) }
  'minimized' { (Get-CockpitWindow).IsMinimized.ToString().ToLower() }
  'maximized' { (Get-CockpitWindow).IsMaximized.ToString().ToLower() }
  'titlebar' {
    $w = Get-CockpitWindow
    "$($w.X) $($w.Y) $($w.Width) $([int][math]::Round(44 * $w.Scale))"
  }
  'button' {
    if (-not $Argument) { Show-Usage }
    $w = Get-CockpitWindow
    $point = Get-CockpitControlPoint -Window $w -Control $Argument
    [void](Assert-ControlPointIsClickable -Window $w -Point $point)
    "$($point.X) $($point.Y)"
  }
  'buttons' {
    $w = Get-CockpitWindow
    foreach ($control in 'minimize', 'maximize', 'close', 'dragregion') {
      $point = Get-CockpitControlPoint -Window $w -Control $control
      $status = try {
        [void](Assert-ControlPointIsClickable -Window $w -Point $point); 'ok'
      }
      catch { "BLOCKED: $($_.Exception.Message)" }
      "{0,-11} {1,5} {2,5}  {3}" -f $control, $point.X, $point.Y, $status
    }
  }
  'frontmost' { Get-ForegroundProcessName }
  'shot' {
    $w = Get-CockpitWindow
    if ($w.IsMinimized) {
      Write-Warning 'Window is minimized; the crop will capture whatever is behind it.'
    }
    Save-CockpitScreenshot -Window $w -Path ($Argument ? $Argument : (Join-Path ([IO.Path]::GetTempPath()) 'native-ui-shot.png'))
  }
  'awake' {
    [void](Set-DisplayAwake)
    'display held awake for the lifetime of this shell'
  }
  'info' { Get-CockpitWindow | Format-List }
  default { Show-Usage }
}
