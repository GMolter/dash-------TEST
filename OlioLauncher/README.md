# Olio Launcher

Olio Launcher is a native AutoHotkey v2 Windows launcher. The current code implements
the approved Milestones 1–7 behavior: one
resident process, Focus Key activation, right-edge
placement, native navigation, validated local settings, optional per-user startup,
redacted diagnostics, memory-only clipboard history, clipboard-only screen capture, a
secure Olio account connection, private read-only Quick Pastes, and a read-only Google
Calendar view for the rest of the current day.

The shell uses a compact Workstation-themed grid of owner-drawn native Windows button
controls, with slate surfaces, spatial keyboard focus, a compact settings pill, and the
Workstation `O|` brand mark in the header and tray. Enabled tiles open native placeholder
pages or native actions, and clicking outside the launcher hides it. The shell does not
embed HTML, WebView2, Electron, or another browser runtime.

Clipboard History keeps the ten most recent unpinned items, supports a bounded pinned
set, and presents them in a compact, scrollable card list. Clicking a card restores that
item, moves it to the top without duplicating it, and leaves the launcher open. Delete
and clear-with-confirmation remain visible management actions. Open sits immediately left
of Delete: it is greyed out for text and opens a native memory-only preview for images.
The preview uses the same borderless Olio header and compact owner-drawn controls as the
launcher, with no dimensions or storage-status text.
Clipboard payloads are never persisted or transmitted. Selecting Screenshot hides the
launcher, freezes the activation frame, and opens a native dimmed overlay across the
complete virtual desktop. The frozen frame stays unchanged while you select. Drag in any
direction, release to copy the selected pixels directly as an in-memory Windows
bitmap and add the same image to memory-only Clipboard History, or press Escape to cancel
without changing the clipboard. A rapid double press of the Focus Key opens screenshot
selection directly without moving or closing the launcher or an open image preview; using
the Screenshot tile still hides the launcher first. No image encoder,
image file, Snipping Tool, helper process, browser runtime, or network path is used.
Settings can connect a named launcher to an Olio account through the user's normal
browser without collecting an Olio password. The launcher uses short-lived one-time
authorization, Windows CNG, bounded asynchronous HTTPS requests, and Windows Credential
Manager. Workstation can list and revoke each device, and launcher disconnect requires
confirmation. A newly approved device receives the reviewed `quick-pastes:read` scope
and can synchronize only its owner's Quick Pastes into process memory. Native search
covers titles, contents, categories, and favorites without a separate category selector.
Favorite (pinned) results remain at the top, and the owner-drawn list uses accelerated,
high-resolution-aware wheel scrolling. Selecting a result copies it through Clipboard
History's suppression path; refresh and explicit paste are also available. Management
remains in Workstation. No offline Quick Paste cache exists. Calendar replaces the old
Send to Phone placeholder. It keeps only the current day's schedule in a user-bound,
Windows DPAPI-encrypted local cache, refreshes quietly shortly after startup and about
every two hours, and also supports manual refresh from the Calendar page or Settings.
The cache is discarded when it belongs to another day/device or the account/calendar is
disconnected. Network Analyzer remains disabled and executes no action.

Milestone 7 adds a compact standalone native Settings window that opens directly from
the launcher. Its primary General, Clipboard & paste, and Account tabs keep everyday
choices close at hand; monitor/position tuning, diagnostics, exclusions, and reset live
behind the quiet overflow menu. Choices save immediately, typed values save after a
short validation delay, and hovering a setting reveals native explanatory help without
adding rows of help buttons. It provides safe
schema-versioned settings, hotkey conflict validation, active/primary/remembered monitor placement,
right-edge/remembered positioning, width limits, runtime always-on-top and focus-loss
behavior, opt-in close/auto-paste selection policies, persisted clipboard pause and
plain-language Clipboard History app exclusions, system/dark/light themes, high-contrast adaptation,
reduced motion, and strictly redacted diagnostics. Automatic paste is off by default and
can target only the application active before the launcher; a Windows focus or integrity
failure leaves the item copied for manual paste. Reset explicitly preserves the Olio
account connection and protected credential. Disconnect remains a separate confirmed
action.

## Run from source

Double-click `Run-OlioLauncher.cmd` during development to close only launcher processes
started from this folder and restart the current source. It does not terminate unrelated
AutoHotkey scripts. Clipboard History is intentionally cleared by any launcher restart.

Install AutoHotkey 2.0.26, then run from the repository root:

```powershell
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" ".\OlioLauncher\OlioLauncher.ahk"
```

The first launch opens the panel. Press the laptop Copilot key
(`LWin+LShift+F23`) once to hide or show it, or press it twice within 350 ms to start
Dynamic Screenshot directly. A second launch toggles the existing process
instead of creating another resident launcher. Exit completely from the tray icon.

See [setup.md](docs/setup.md) for settings and operation,
[milestone2-results.md](docs/milestone2-results.md) for approved Clipboard History
evidence, [milestone3-results.md](docs/milestone3-results.md) for Dynamic Screenshot
verification, and [milestone5-results.md](docs/milestone5-results.md) for authorization,
isolation, privacy, and manual connection checks. Milestone 6 authorization, test
evidence, and its nontechnical checklist are in
[milestone6-results.md](docs/milestone6-results.md). Milestone 7 settings, accessibility,
privacy, isolated test evidence, and environmental limitations are in
[milestone7-results.md](docs/milestone7-results.md).
