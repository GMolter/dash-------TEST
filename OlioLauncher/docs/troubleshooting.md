# Milestone 7 troubleshooting

## Preferences cannot be saved

Nothing is committed when Focus Key validation, isolated per-user startup registration,
or atomic settings replacement fails. Correct the displayed generic issue; the field
automatically retries after the next selection or short pause in typing. A successful
change shows **Saved** at the bottom of the window.
The launcher never attempts elevation. Do not include the Focus Key exception text,
sensitive-application list, settings file, account metadata, or Credential Manager
screenshots in a support report.

## The Focus Key is invalid, reserved, or unavailable

Choose a modified key that is not a Windows secure/system shortcut. Escape, Tab,
Alt+Tab, Ctrl+Alt+Delete, Windows+L, Windows+U, and lone modifier keys are rejected.
Conflict testing occurs before persistence. If another application owns the key, choose a
different combination; Olio Launcher will not terminate or reconfigure that application.

## The panel opens on the wrong monitor or partly off screen

Open the **•••** menu, choose **Advanced settings**, and review **Open on** and
**Place it at**. Active
uses the application that was active before the launcher; Primary uses the Windows
primary work area; Remembered uses the monitor saved by dragging the launcher header.
When a remembered display is removed, the nearest usable work area is selected.
Remembered coordinates, width, and height are clamped inside the current taskbar-aware
work area after monitor, docking, DPI, and taskbar changes.

Choose Middle right to discard the visible effect of a stale remembered coordinate. A
settings reset also restores Active monitor, Middle right, and Standard scale while
preserving the Olio account connection.

## Close-after-selection or automatic paste is surprising

Both options default off. Close-after-selection hides only after a successful mouse,
Enter, or Space item choice. Explicit Copy remains copy-only. Automatic paste publishes
the chosen item, hides the panel, and targets only the application that was active before
the launcher. If the target closed, foreground verification fails, or Windows integrity
rules block input, the item remains copied and a manual-paste recovery message appears.
The launcher never retries against whichever window happens to be focused and never
elevates.

Clipboard capture pause and sensitive-application exclusions do not block deliberate
copy/paste actions. Pause blocks new history capture. Exclusions block capture only when
Windows identifies a matching source executable.

## Text, focus, or colors are difficult to read

Use Follow Windows for normal light/dark and automatic high-contrast behavior. Dark and
Light override only the regular color preference; active Windows high contrast still
wins. Visible focus uses a two-pixel DPI-scaled outline, and disabled controls retain a
native disabled state plus distinct colors. The custom-drawn switches keep native button
semantics. Motion is permanently minimized without disabling controls.

At 100%, 125%, and 150% Windows scaling, close and reopen the panel after a display change
so it re-resolves the work area and DPI. Real mixed-DPI hardware should still be checked
with the manual matrix in `milestone7-results.md`.

## Reset and Olio account connection

Reset explicitly preserves the protected Olio connection and says so before confirmation.
It cannot revoke or delete a credential. To disconnect, use **Disconnect Olio Account**,
read the separate warning, and keep the default No choice unless revocation is intended.
If server revocation cannot be confirmed, the local credential remains for retry.

If a corrupt settings file loses the non-secret device identity, the launcher can recover
exactly one Olio Launcher Credential Manager target. If multiple targets exist, it
reports a recovery state and deletes none. Remove obsolete devices through Workstation
Profile Settings, then reconnect. Never delete guessed Credential Manager entries.

## Quick Pastes says connect in Settings

Open **Settings** and approve the launcher. A device approved before Milestone 6 retains
only `connection:status`, so it must be disconnected and approved again to receive the
separate `quick-pastes:read` scope. Existing devices are intentionally not upgraded in
place.

## Quick Pastes is offline, rate-limited, or cannot synchronize

The last successful in-memory list may remain visible and is explicitly labeled stale.
Check connectivity and choose **Refresh** later. Rate limits reset within the displayed
recovery window. Do not include response bodies, Quick Paste text, credentials, account
identifiers, or authorization headers in diagnostics.

If the page says synchronization is not available on Olio Workstation yet, the connected
device-status endpoint is present but the Milestone 6 API action or database migration has
not been deployed. Apply the committed migration and deploy the updated existing
`/api/launcher` function through the approved release process; reconnecting alone cannot
install missing backend code.

An invalid or oversized response is rejected without partially replacing the current
list. The server permits at most 100 items, 20,000 content characters per item, 500,000
aggregate content characters, and a 1 MiB JSON response.

## Paste did not reach the previous application

The selected content remains on the clipboard; return to the intended application and
paste manually. Olio Launcher never elevates itself. Windows blocks a standard-user
process from sending input to an elevated target, and the launcher abandons paste if the
previous window disappears or another window takes focus. Clipboard pause and sensitive-
application capture exclusions remain in force; launcher-published content uses the
existing duplicate-suppression path.

## A revoked device still shows old Quick Paste rows

Open or refresh Quick Pastes. The next protected request returns the same content-free
invalid state as an unknown device and clears the local credential and all in-memory
Quick Paste rows. Confirmed disconnect and launcher exit clear them immediately as well.
There is no disk cache to recover.

## Connect says account connection is not ready

The launcher automatically uses `https://olio.one`; there is no address to enter. This
message means the deployed Workstation database migration or server configuration is not
ready. Apply the committed Milestone 5 Supabase migration to the intended project, verify
all later launcher migrations in timestamp order (including the pairing-expiry fix),
verify the server-only Supabase variables in Vercel, then redeploy. Never place a
service-role key, session, credential, or other secret in launcher settings.

## The browser does not open or the request expires

Choose **Cancel authentication** and try again. The request lasts 10 minutes and is
single-use. Do not share the display code or a
screenshot of the authorization page. The code alone cannot obtain a credential, but it
identifies a live approval request.

## Approval succeeds but the launcher stays waiting

Keep Settings open for one polling interval, then use the safe retry action. Firewall,
proxy, DNS, or server errors produce an offline/recoverable state without changing the
protected credential. Never paste a request body, response body, authorization header,
Supabase session, credential, or pairing value into a support report.

## Workstation says the device is revoked

The launcher deletes an invalid protected credential and reports a revoked recovery
state. Choose **Connect Olio Account** to create a new short-lived request. Revocation is
intentional and blocks every later device-authenticated operation; it does not delete
Clipboard History or change Dynamic Screenshot.

## Disconnect cannot reach Olio

Nothing is deleted when server revocation cannot be confirmed. Restore connectivity and
retry so server and local state cannot diverge. If the device is lost, revoke it from
Workstation Profile Settings; the lost launcher will be rejected on its next status check.

## The Copilot key does not toggle the panel

Exit other AutoHotkey probe scripts first. Verify `focusKey` is `#+F23`. Any registration
error appears in the panel status line. The launcher remains a standard-user process and
does not elevate itself.

## Windows Settings opens from the Copilot key

Confirm the Milestone 0 probe is not running with an old pass-through hook. The Milestone
1 Focus Key uses a non-pass-through AutoHotkey hotkey and suppresses F23 before Windows
receives the complete chord.

## A rapid double press does not start Screenshot

Release the Copilot/Focus Key fully between presses and make the second press within
350 ms. One press toggles the panel after that short decision window. Holding the key down
is deliberately treated as one press so Windows key-repeat cannot start an unexpected capture. If a
capture is already active, more presses are ignored and cannot create another overlay.

## A second panel or process appears

This is a defect. Capture the output of:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'AutoHotkey64.exe'" |
    Where-Object CommandLine -Like '*OlioLauncher.ahk*' |
    Select-Object ProcessId, CommandLine
```

Do not terminate unrelated AutoHotkey scripts. Olio Launcher uses a per-user named mutex
and deduplicated registered-message activation.

## Settings are invalid

The launcher migrates schema 1, ignores unknown future fields, and uses defaults for
malformed or out-of-range known values. A corrupt source is backed up before a subsequent
launcher write. Prefer the standalone native Settings window. Do not stop or restart a resident
launcher merely to inspect settings, because doing so destroys its memory-only Clipboard
History.

## The panel cannot type into an elevated application

Windows integrity rules prevent a normal process from reliably injecting input into an
administrator-elevated target. The foundation does not silently elevate itself. No
Milestone 1 feature needs administrator access.

## A copied item does not appear

Open Clipboard History and check whether the status says capture is paused, excluded, or
oversized. Use **Pause Clipboard History** in the standalone Settings window to resume
capture. Review **Apps ignored by Clipboard History** if copying from only one application
is skipped. Only stop the
launcher to change that setting if you accept that its memory-only history will be cleared.
Copies from a process listed in `sensitiveApplications` are intentionally ignored when
Windows exposes that process as the clipboard owner. Text over 1 MiB and image data over
16 MiB are not retained.

Windows does not always identify the clipboard-owner application. In that case an
exclusion cannot be applied; this is expected. Source metadata remains internal and is
never displayed, and the launcher does not guess from content or window titles.

## Paste returns to the application but inserts nothing

Activate the clipboard card, then paste manually with Ctrl+V. A standard-user launcher
cannot send input into an administrator-elevated target. The launcher does not elevate
itself to bypass this Windows protection.

## Clipboard History vanished after exit

This is the intended privacy behavior. History lives only in process memory. Exiting from
the tray or restarting Windows destroys every retained text string, image buffer, and
preview bitmap.

## Open is greyed out in Clipboard History

That is expected when a text card is selected. Open becomes available only for image
cards. Use the mouse or Up/Down to select an image, then choose Open or focus it with Tab
and press Enter. The preview remains in memory only and closes with Escape.

## An image preview does not open or appears blank

Confirm the selected card says **Image** and was not removed by Clear all or the ten-item
limit. Close the preview with Escape and try the card again. The launcher does not create
a fallback image file, invoke Paint, or start another process. Do not include the image
pixels when reporting a problem.

## Direct screenshot closed the launcher or image preview

This is a defect. A rapid double press of the Copilot/Focus Key must leave both windows in
place behind the selection overlay and restore the same foreground window afterward. Only
choosing the Screenshot tile inside the launcher should hide launcher-owned windows.

## Screenshot selection does not start

Open the launcher and select the enabled **Screenshot** tile. A capture already in
progress ignores additional Focus Key presses and activation requests so duplicate
overlays cannot appear. Press Escape once, then try again. Do not start Windows Snipping
Tool; Olio Launcher does not depend on it.

## The selected screenshot is not on the clipboard

Another application may be holding the Windows clipboard open. Olio Launcher retries
briefly; if contention continues, it releases the captured bitmap, restores focus, and
shows a safe error. Wait a moment and select Screenshot again. Do not close or restart a
resident launcher just to retry, because restarting clears its memory-only history.

Very large virtual desktops may also exhaust available GDI memory. Select a smaller area
and try again. The failed capture is not saved to a file or cache.

## The screenshot is on the clipboard but not in Clipboard History

Clipboard publication remains successful even if history is paused or the captured image
exceeds the existing 16 MiB in-memory retention limit. Resume capture through the
`clipboardPaused` setting or choose a smaller harmless area. A retained screenshot should
appear exactly once; repeated copies indicate a defect and should be reported without
including the screen pixels.

## Escape changed or cleared the clipboard

This is a defect. Cancellation is handled before `OpenClipboard` or `EmptyClipboard` and
must preserve every prior format exactly. Avoid copying sensitive content while
investigating. Record only the launcher version, display scaling, monitor arrangement,
and whether cancellation occurred before or during a drag—never record the clipboard
contents or screen pixels.

## The selection border is misplaced on a scaled or secondary monitor

Confirm Windows display scaling is set to a supported 100%, 125%, or 150% value and that
the monitors are arranged correctly in **Settings > System > Display**. Olio Launcher uses
physical virtual-desktop coordinates under Per-Monitor V2 awareness, including negative
coordinates. Sign out and back in only if Windows itself asks after a scaling change; do
not restart the launcher merely for troubleshooting because that clears Clipboard History.

## No image file appeared after capture

That is expected. Dynamic Screenshot places an in-memory bitmap on the clipboard only.
Paste it into Paint with Ctrl+V if you want to save it manually. Olio Launcher never
creates PNG, JPEG, BMP, thumbnail, preview, cache, or temporary image files.
