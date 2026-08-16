# Olio Launcher security and privacy

## Local privilege boundary

Olio Launcher runs as the signed-in standard Windows user. Focus Key registration,
per-user `HKCU` startup, native settings, Clipboard History, Dynamic Screenshot, Quick
Pastes, paste input, and diagnostics require no elevation. The launcher has no service,
driver, privileged helper, machine-wide registry path, firewall rule, packet capture, or
automatic UAC path. Windows integrity restrictions are respected: input to an elevated
target may fail, and the launcher leaves the item copied for manual paste.

## Settings and protected credentials

`%LOCALAPPDATA%\OlioLauncher\settings.json` contains schema-versioned non-sensitive
preferences and device display/lookup metadata only. It never contains an Olio password,
device credential, pairing secret, access token, authorization header, browser session,
email, stable account ID, request/response body, Quick Paste row, clipboard payload, or
screenshot pixel.

The device credential remains a current-user generic credential in Windows Credential
Manager. Its target is isolated by the launcher device UUID. Corrupt settings recovery
may enumerate only Olio Launcher target names to recover that non-secret UUID; it never
exports or serializes credential bytes. Exactly one target is recoverable. Multiple
targets produce an explicit state and none is deleted.

A settings reset is not a disconnect. Reset preserves the device identity, safe display
metadata, and protected credential and says so in a default-cancel confirmation.
Disconnect is a separate default-cancel action that first confirms server removal, then
deletes the matched local credential. A network failure preserves it for retry.

## Clipboard and Quick Paste boundaries

Clipboard History entries, comparisons, source metadata, previews, and image buffers
exist only in process memory and are destroyed on exit. They have no settings, file,
database, cache, crash-report, diagnostic, or network writer. Clipboard pause stops new
capture. Sensitive-application exclusions accept only bounded semicolon-separated
executable names and compare them case-insensitively when Windows exposes an owner;
neither source name nor content is logged.

Quick Paste rows, search results, selected content, and last-sync time likewise remain in
process memory. The launcher still has no plaintext or encrypted offline cache. Its
credential scope remains `connection:status` plus `quick-pastes:read`; ownership is
derived by Workstation from the matched device. Management and organization sharing
remain outside the launcher.

Both manual and automatic selection use `ClipboardManager.PublishText` or the equivalent
history restore, preserving sequence/owner duplicate suppression. Automatic paste is
off by default. When enabled it captures the previously active root window before opening
the launcher, publishes first, hides, focuses only that saved target, verifies it is still
foreground, and then sends Ctrl+V. It never substitutes a newly focused window. Failure
does not elevate, broaden scope, or discard the copied recovery value.

## Dynamic Screenshot

Dynamic Screenshot remains independent of Milestone 7. It uses the corrected
DPI-dependent `CreateFontW`/`DeleteObject` ownership, in-memory GDI capture, and
`CF_BITMAP` transfer. It creates no image, thumbnail, preview, temporary, cache, or
diagnostic file and sends no pixels to a network, browser, helper, or database.

## Redacted diagnostics

Diagnostics default off. Enabling them creates only timestamp, allowlisted event name,
and short token-shaped status lines. The logger rejects unknown events and replaces
email-like text, UUIDs, 64-character secrets, authorization/body/content terms,
multiline text, and oversized values with `redacted` before file output.

The toggle can never enable credential, token, pairing material, authorization header,
email, stable account ID, request/response body, Quick Paste content, clipboard content,
screenshot pixels, executable exclusions, window text, or screen-coordinate logging.
Logs rotate at 1 MiB and are not an export or support bundle.

## Deferred features

Calendar replaces Send to Phone with read-only, owner-bound schedule access. Google refresh
tokens remain encrypted in Workstation; the launcher keeps only the current day's bounded
event view in a Windows DPAPI-encrypted, device-bound cache and deletes stale or disconnected
cache data. Network Analyzer remains disabled and executes no behavior. Milestone 7
adds no packaging, installer, updater, organization sharing, backend endpoint, database
migration, service-role key, or thirteenth Vercel function. The hard-delete launcher
device migration remains the latest database rule:
`20260718193000_hard_delete_removed_launcher_devices.sql`.
