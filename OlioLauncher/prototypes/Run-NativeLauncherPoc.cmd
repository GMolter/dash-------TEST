@echo off
setlocal
set "OLIO_POC_ROOT=%~dp0"
set "OLIO_POC_SCRIPT=%~dp0NativeLauncherPoc.ahk"
set "OLIO_PRODUCTION_SCRIPT=%~dp0..\OlioLauncher.ahk"
set "OLIO_PRODUCTION_COMPILED=%~dp0..\OlioLauncher.exe"
set "OLIO_POC_AHK=C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"

if not exist "%OLIO_POC_SCRIPT%" (
  echo NativeLauncherPoc.ahk was not found beside this file.
  pause
  exit /b 1
)

if not exist "%OLIO_POC_AHK%" (
  echo AutoHotkey v2 was not found at "%OLIO_POC_AHK%".
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$poc=[IO.Path]::GetFullPath($env:OLIO_POC_SCRIPT); $production=[IO.Path]::GetFullPath($env:OLIO_PRODUCTION_SCRIPT); $compiled=[IO.Path]::GetFullPath($env:OLIO_PRODUCTION_COMPILED); $comparison=[StringComparison]::OrdinalIgnoreCase; $targets=Get-CimInstance Win32_Process | Where-Object { $ahk=$_.Name -match '^AutoHotkey(32|64)?\.exe$'; $sourceProcess=$ahk -and $_.CommandLine -and ($_.CommandLine.IndexOf($production,$comparison) -ge 0 -or $_.CommandLine.IndexOf($poc,$comparison) -ge 0); $compiledProcess=$_.Name -ieq 'OlioLauncher.exe' -and $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath).Equals($compiled,$comparison); $sourceProcess -or $compiledProcess }; $ids=@($targets | ForEach-Object { $_.ProcessId }); $targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop }; if ($ids.Count) { $deadline=[DateTime]::UtcNow.AddSeconds(5); do { Start-Sleep -Milliseconds 100; $alive=@($ids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }) } while ($alive.Count -and [DateTime]::UtcNow -lt $deadline); if ($alive.Count) { throw 'An existing Olio launcher process did not close.' } }; Start-Process -FilePath $env:OLIO_POC_AHK -ArgumentList @($poc) -WorkingDirectory $env:OLIO_POC_ROOT"

if errorlevel 1 (
  echo.
  echo The production launcher could not be replaced by the POC.
  pause
  exit /b 1
)

echo Native launcher POC started. It now owns the configured Focus Key.
endlocal
