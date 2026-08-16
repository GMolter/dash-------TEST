# Milestone 0 diagnostic prototypes

## Minimal native launcher POC

`NativeLauncherPoc.ahk` is an additive visual proof of concept based on the supplied
`olio-launcher-poc-iteration3.html` layout. It uses a 296-pixel quick-settings-style flyout:
an uppercase Olio label, three compact rows with circular Fluent badges and live status
text, chevrons only for expandable destinations, and a separated footer gear. Clipboard
and Quick Pastes open as compact same-footprint subpanels with inline actions and the real
production data/selection behavior. Dark and light surfaces follow the reference's neutral
Windows flyout treatment while accents come from Olio's shared theme; system-theme and
high-contrast behavior remain supported.

Screenshot remains the inherited immediate action and its capture implementation is not
overridden or modified. The footer gear only opens the existing standalone Settings menu.
Unfinished destinations remain hidden. The POC subclasses the production `LauncherWindow`,
but it does not modify the production entrypoint or class.

Double-click `Run-NativeLauncherPoc.cmd` to start the POC. The runner intentionally closes
only an existing production Olio Launcher and an older copy of this POC before starting a
fresh POC. The POC then registers the configured global Focus Key, so the same launch key
opens and hides the POC. To return to production, run `Run-OlioLauncher.cmd`.

The POC intentionally shares the production profile selected for this evaluation:

- Settings are read from and written to `%LOCALAPPDATA%\OlioLauncher\settings.json`.
- Quick Pastes uses the same device identity and Windows Credential Manager credential.
- Start-with-Windows changes update the production launcher startup entry.
- Reset affects production settings, and Disconnect revokes the production launcher's
  shared Olio device credential.
- Focus Key edits are validated, saved, and registered by the running POC. Production
  reads the same saved key the next time it starts.

The normal runner prevents production and the POC from competing over in-memory settings
or the global shortcut. Manual starts can bypass that protection, so do not start both
entrypoints directly while changing Settings. Disconnect still revokes the shared device
credential used when production is restarted. Clipboard and Quick Paste content remain
subject to the production launcher's existing privacy boundaries.

Run the isolated POC checks without opening either resident launcher:

```powershell
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" /ErrorStdOut `
  ..\tests\NativeLauncherPocTests.ahk
```

For visual inspection without click-away hiding, network access, credential access, or a
startup write, launch `NativeLauncherPoc.ahk --visual-test`. This diagnostic mode uses a
third, isolated instance namespace and should be closed after inspection.

The remainder of this document describes the earlier Milestone 0 diagnostic probes.

These files are technical spikes, not the Olio Launcher application or production UI.
They intentionally live outside the planned `src/` tree and must not be promoted to
Milestone 1 without review.

Requirements: Windows 11 and AutoHotkey v2. Run from a standard-user PowerShell prompt.

## Selecting a mode

Open PowerShell in this `prototypes` directory and pass the desired mode as the argument
after `Milestone0Probe.ahk`. Double-clicking the AHK file only shows the help dialog.

```powershell
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk hotkey
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk panel
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk clipboard
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk clipboard-test
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk capture
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" .\Milestone0Probe.ahk capture-test
.\Measure-Milestone0.ps1
```

The modes verify:

- `hotkey`: suppresses F23 down/up so the Copilot key cannot invoke its native Windows
  action, while recording Win/Shift state and event metadata. F8 opens native AutoHotkey
  key history. No ordinary keystrokes are logged.
- `panel`: shows a frameless diagnostic panel at the right edge of the foreground
  window's monitor. It uses Per-Monitor V2 awareness and handles `WM_DPICHANGED`.
- `clipboard`: subscribes to `OnClipboardChange` and records only format presence and
  callback type, never clipboard contents.
- `clipboard-test`: preserves the current clipboard, generates text and bitmap changes,
  verifies both callback paths, then restores the prior clipboard.
- `capture`: Ctrl+Alt+S or this mode opens a virtual-desktop selection overlay. The
  selected pixels are copied as `CF_BITMAP` using GDI handles; no image encoder, path,
  stream, temporary file, or permanent file is used. When launched directly in
  `capture` mode, the process exits automatically after success, cancellation, or error.
- `capture-test`: performs 25 small screen-to-clipboard captures, verifies `CF_BITMAP`,
  checks the process GDI-object count, and restores the prior clipboard.
- `benchmark`: records show-to-synchronous-`UpdateWindow` latency and working set. The PowerShell runner
  adds a repeatable, visually silent cold-start proxy and hidden-resident idle sampling.
- `cold-start` and `resident` are internal noninteractive modes used by the PowerShell
  runner. They construct the native GUI without showing it, so automated measurements
  do not flash or leave a panel on screen.

All generated output is metadata-only TSV under `prototypes/results/`. Captures exist
only in GDI memory and on the Windows clipboard. Exit any interactive mode with
Ctrl+Alt+Q.

The target laptop reports its Copilot key as `LWin+LShift+F23` (`VK 86`, `SC 06E`).
Repeat-state checks and real 100%, 125%, 150%, mixed-DPI multi-monitor layouts still
require manual validation; do not infer those results from a single display setup.
