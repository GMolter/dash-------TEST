# Milestone 7 setup and operation

## Requirements

- Windows 11
- Standard-user account; do not run the launcher as administrator
- AutoHotkey 2.0.26 while running from source

The standalone compiled executable is a Milestone 8 deliverable. No installer, service,
driver, browser runtime, or helper process is used by the current foundation.

## Start manually

From the repository root:

```powershell
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" ".\OlioLauncher\OlioLauncher.ahk"
```

Normal launch opens the panel. `--background` starts the resident process without
showing the panel:

```powershell
& "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe" ".\OlioLauncher\OlioLauncher.ahk" --background
```

Launching either command while Olio Launcher is already running sends one toggle request
to the existing process and exits the new process immediately.

## Controls

- Copilot key / default Focus Key: press `LWin+LShift+F23` once to show or hide the panel;
  press and release it twice within 350 ms to open Dynamic Screenshot directly
- Up/Down: move between enabled navigation buttons
- Enter: select the focused button
- Escape: hide the panel and restore the prior foreground window
- Tray menu **Open / Hide**: toggle the panel
- Tray menu **Exit**: unregister the Focus Key and end the process

On the Clipboard History page:

- Use the mouse wheel or Up/Down to scroll through as many as ten clipboard cards.
- Click a card or focus it and press Enter to restore it to the clipboard. The same entry
  moves to the top without creating a duplicate, and the launcher stays open.
- Tab and Shift+Tab move through Clear all, the card list, Open, Delete, and Back. Enter
  activates the focused action.
- Open is greyed out for text. For an image, select its card and choose Open to show a
  larger native preview. Press Escape or use the compact header close control to return to
  Clipboard History. The preview intentionally omits pixel dimensions and storage text.
- Delete removes the selected card.
- Clear all always asks for confirmation, with No selected by default.

Calendar replaces Send to Phone and shows the rest of today's Google Calendar schedule.
Network Analyzer remains disabled. Dynamic Screenshot is active.
Secure account connection and read-only Quick Pastes are available. Quick Paste creation,
editing, deletion, reordering, and other management remain in Workstation.

## Connect an Olio account

1. Open **Settings** in the launcher.
2. Enter a recognizable device name. The production Workstation origin is built in as
   `https://olio.one` and cannot be changed in normal settings.
3. Choose **Connect Olio Account**. The launcher opens the authorization page in the
   default browser and shows the same short display code.
4. Sign in through the normal Workstation sign-in screen if necessary. Confirm the device
   name and code, then explicitly approve or deny.
5. Return to launcher Settings. Successful approval reports **Connected** and enables
   the device's reviewed `quick-pastes:read` scope.

The request expires after 10 minutes. Polling occurs at most every 3 seconds and stops on
approval, denial, expiry, cancellation, failure, or success. **Cancel authentication**
invalidates the pending request. **Disconnect Olio Account** requires confirmation,
revokes the server device, and then deletes the protected local credential. Workstation
Profile Settings provides a separate confirmed revoke action.

Existing devices approved before the Milestone 6 migration retain only
`connection:status`; they are not silently broadened. If Quick Pastes reports that a new
approval is required, disconnect and approve that launcher again.

## Google Calendar

1. In Olio Workstation, open **Profile Settings**, find **Google Calendar**, and choose
   **Connect calendar**. Google asks only for read-only Calendar access.
2. Open the launcher's **Calendar** tile. It loads ongoing and upcoming events through
   the end of the local day; event times are displayed in the Windows local time zone.
3. Use **Refresh** on the Calendar page for an immediate update. The Account page in
   launcher **Settings** also has **Refresh schedule** for the same manual action.

The launcher refreshes quietly about 15 seconds after startup and every two hours after
that. Only the current day's bounded event view is cached locally. The cache is protected
with Windows DPAPI for the current Windows user, tied to the launcher device ID, replaced
after successful refresh, and removed when it is stale or the account/calendar is
disconnected. A network failure leaves a valid current-day cache visible.

## Quick Pastes

1. Connect the launcher, then open **Quick Pastes**. Opening the page starts
   synchronization directly; it is asynchronous and the native panel remains responsive.
2. Type in **Search** to match titles, contents, saved categories, or “favorite.”
   Search operates only on the current in-memory list and never changes Workstation data.
   Favorite (pinned) results appear first while retaining their Workstation order.
3. Select an item with the mouse to copy it immediately, just like Clipboard History.
   With the keyboard, use the arrow keys and press Enter. **Copy** repeats the same action.
   Only the selected content reaches the clipboard, using Clipboard History's existing
   duplicate-suppression path.
   The mouse wheel moves two cards per full notch and accumulates smaller touchpad or
   high-resolution wheel deltas.
4. **Paste** copies the selected content and sends Ctrl+V only to the application that
   was active immediately before the launcher. If focus or Windows integrity rules
   prevent that, the content remains copied for manual paste.
5. Choose **Refresh** for explicit synchronization. The panel displays the last successful
   synchronization time.

A temporary network failure may leave the last in-memory list visible with a stale/error
label and retry action. Revocation, confirmed disconnect, or launcher exit immediately
clears the list. Quick Paste rows, contents, last-sync state, search text, and categories
are not written to settings, logs, files, or an offline cache.

## Dynamic Screenshot

1. Open Olio Launcher and select **Screenshot** with the mouse, or focus it with the
   arrow keys and press Enter.
2. The launcher hides and the complete Windows desktop dims. The pointer becomes a
   crosshair.
3. Hold the left mouse button, drag around the harmless screen area you want, and release.
   Dragging left, right, up, down, or across monitors is supported.
4. Paste the result into Paint or another image-capable application with Ctrl+V.
5. Press Escape before releasing to cancel. Cancellation does not change any clipboard
   format or content.

After a successful capture, open Clipboard History to see the image as the newest
memory-only item. The screenshot is added once even though Windows also reports a
clipboard-change event. Existing pause and image-size limits still apply. You can also
start at step 2 without opening the panel: press and release the Copilot/Focus Key twice
within 350 ms. This direct path leaves the launcher and an open image preview exactly where
they are behind the selection overlay. Selecting Screenshot from the launcher remains the
only path that hides the launcher before selection.

The capture is a native in-memory Windows bitmap. Olio Launcher does not start Snipping
Tool, encode an image, create a thumbnail or preview file, save to a temporary folder,
or transmit pixels. If another program temporarily locks the clipboard, the launcher
retries briefly and then reports a safe, content-free error. Empty selections are ignored.
The prior application regains focus after success, cancellation, or failure.

For a nontechnical safety checklist covering reverse dragging, multiple monitors, DPI
scaling, repeated captures, keyboard use, Paint, and no-file verification, see
[milestone3-results.md](milestone3-results.md#simple-manual-test-checklist).

## Settings

Settings are read from:

```text
%LOCALAPPDATA%\OlioLauncher\settings.json
```

The folder is created only after a setting must be written. Choose **Settings** on the
launcher home screen to open the standalone native Settings window directly. General,
Behavior, Clipboard, Appearance, Account, and Advanced are always available in the
persistent sidebar. Choices save
immediately. Text fields validate and save after a short pause in typing. **Saved**
appears quietly at the top right after a successful change; there is no separate Save button.
Hover a setting, its label, or its control for a description; help does not require a
separate question-mark button. Start from
`config/settings.example.json` only when an isolated source-build fixture needs a manual
file. Supported values and safe defaults are:

| Setting | Values | Default |
| --- | --- | --- |
| Focus Key | usable, non-reserved AutoHotkey v2 hotkey | `#+F23` |
| Start with Windows | on/off | off |
| Opening monitor | Active, Primary, Remembered | Active |
| Opening position | Upper right, Middle right | Middle right |
| Launcher scale | Compact (90%), Standard (100%), Large (115%) | Standard |
| Always on top | on/off | on |
| Hide the launcher when I click elsewhere | on/off | on |
| Close after choosing an item | on/off | off |
| Automatically paste after selection | on/off | off |
| Clipboard History capture | active/paused | active |
| Apps ignored by Clipboard History | up to 32 semicolon-separated `.exe` names | `KeePass.exe;KeePassXC.exe;1Password.exe;Bitwarden.exe` |
| Theme | Follow Windows, Dark, Light | Follow Windows |
| Redacted diagnostics | on/off | off |
| Olio account | Connect, Cancel, Retry, Disconnect | disconnected on a new device |

Internal non-sensitive fields include `settingsSchemaVersion` (currently 2),
`lastSelected`, remembered monitor name/coordinates, the stable device UUID, safe device
name, and connection display timestamps. Quick Paste rows, calendar events, synchronization
timestamps, clipboard data, pixels, credentials, tokens, email, and account identity are absent.

Quick Paste data and synchronization timestamps are deliberately absent from this file.
The separate `%LOCALAPPDATA%\OlioLauncher\calendar-cache.bin` contains only a DPAPI-encrypted
current-day Calendar cache; it is not JSON and cannot be read by another Windows user.

The production Workstation origin is built in as `https://olio.one`; users do not enter
or store an API address. Isolated protocol tests may inject a non-production HTTPS origin
in memory, but normal settings cannot override the product endpoint.

Versionless files migrate from schema 1 to schema 2. Unknown future fields do not prevent
startup. Invalid known fields recover independently to the table above; malformed JSON
recovers the whole document. Before a later write replaces a corrupt/invalid source, the
original is preserved beside it as `settings.invalid.YYYYMMDD-HHMMSS.*.json`. Writes use
a same-directory temporary file and atomic replace.

Focus Key availability is tested before its automatic save. Invalid, reserved, or
conflicting keys produce a generic recoverable message without echoing exception details;
the last valid key remains active. Startup and hotkey changes are rolled back if the
settings file cannot be replaced.

**Reset settings** uses a default-cancel confirmation. It restores every launcher
preference to the safe default while explicitly preserving the current Olio connection,
device identity, connection metadata, and Windows Credential Manager credential. To
revoke and remove the connection, use the separate **Disconnect Olio Account** action and
confirm it. Reset never invokes disconnect, and disconnect never runs as a side effect of
reset.

### Monitor, position, and scaling

- **Active monitor** follows the application that was active immediately before opening.
- **Primary monitor** uses the Windows primary work area.
- **Remembered monitor** reuses the last dragged monitor. If it was removed, the nearest
  usable work area is selected.
- **Upper right** and **Middle right** attach to `rcWork`, respecting the taskbar while
  keeping the launcher away from the center of the workspace.
- Negative virtual coordinates are valid. Removed monitors, invalid/off-screen
  coordinates, taskbar changes, scale changes, and DPI changes are recovered by clamping,
  not by assuming coordinate zero.
- Compact, Standard, and Large scale the whole launcher layout. A compatible numeric
  width remains in schema version 2 for older builds. The
  standalone Settings window acquires its target monitor before sizing so its window and
  controls scale together through Per-Monitor V2 behavior.

### Selection, pause, and exclusions

**Close after choosing an item** applies to mouse, Enter, or Space selection in Clipboard
History and Quick Pastes. Explicit Copy remains a copy-only action.

**Automatically paste after selection** implies a temporary close so Windows can focus
the saved target. It publishes through Clipboard History suppression and targets only the
application active before the launcher opened. It never pastes into a newly focused or
arbitrary window, never requests elevation, and leaves the item copied with a readable
manual-paste notice when focus, destruction, `SendInput`, or integrity restrictions block
insertion.

Clipboard pause prevents new captures but does not prevent a deliberate copy/paste
selection. **Apps ignored by Clipboard History** means anything copied while a listed
application is active is not added to the launcher's history. This is useful for password
managers and other apps containing private text. Entries match only validated executable
file names, case-insensitively, when Windows exposes a clipboard owner. They do not block
pasting into those apps. Neither the executable name nor content enters diagnostics.

### Theme and keyboard access

Follow Windows resolves light/dark and automatically uses Windows high-contrast system
colors. Owner-drawn controls, cards, previews, disabled states, status text, and visible
focus share the resolved palette. Motion is always minimized without disabling any action.

Use Tab and Shift+Tab through Settings, arrows within selection controls and launcher
navigation, Enter or Space to activate the expected control/item, and Escape to close the
Settings window or return from a launcher content page. Destructive confirmations focus
the safe choice by default.

## Start with Windows

Set `startWithWindows` to `true` and restart the launcher. It creates only this per-user
value:

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run\OlioLauncher
```

The source command points to AutoHotkey, the current `OlioLauncher.ahk`, and
`--background`. Setting the option to `false` removes only that value. Neither operation
requires elevation.

## Diagnostics

Diagnostics default off. When `loggingEnabled` is true, metadata-only logs are written to:

```text
%LOCALAPPDATA%\OlioLauncher\logs\launcher.log
```

Logs contain timestamps, event names, and short status tokens. They never contain
clipboard data, captured pixels, Quick Paste content, credentials, pairing codes, or
access tokens. The log rotates at 1 MiB.

The device credential is not in `settings.json`. It is stored under the current Windows
user's Windows Credential Manager as an Olio Launcher generic credential. Do not export,
copy, screenshot, or include that entry in support diagnostics. Pairing secrets live only
in process memory until the request reaches a terminal state.

Clipboard History itself never creates a file. Its text, image buffers, previews, source
application, and comparisons exist only in process memory and disappear when the launcher
exits. The current limits are 1 MiB per text allocation and 16 MiB per image allocation;
oversized content is skipped with a content-free status message.

Synchronized Quick Pastes likewise exist only in process memory. The endpoint returns at
most 100 items, 20,000 content characters per item, 120 title characters, 60 category
characters, and 500,000 aggregate content characters in a response no larger than 1 MiB.
The launcher performs a second validation before replacing its current list.
