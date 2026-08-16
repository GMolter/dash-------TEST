# Milestone 7 — Settings, accessibility, and polish results

Status: **Launcher-local implementation and locally safe automated validation complete.
Clipboard/screenshot suites that would touch a running resident launcher were not run.**

Run date: 2026-07-18 (America/Indianapolis)

## Implementation summary

- Compact 620×460 logical-pixel standalone Settings window opened directly from the
  launcher, with General, Clipboard & paste, and Account tabs plus a quiet overflow-only
  Advanced section for infrequent controls
- Immediate validated auto-save for choices, 350 ms debounced auto-save for typed fields,
  and native whole-setting hover tooltips without visible help buttons
- Owner-drawn switches, sidebar navigation, and actions with native control semantics; redraw
  suppression and palette reuse make section switching immediate
- Settings schema version 2, explicit version-1 migration, independent invalid-field
  recovery, future-field tolerance, corrupt-file backup, and atomic replacement
- Safe defaults for Focus Key, HKCU startup, monitor, position, scale, topmost/focus-loss,
  item-close/auto-paste, capture pause, exclusions, theme, minimized motion, diagnostics,
  selection, remembered placement, and non-sensitive device metadata
- Pre-auto-save generic Focus Key invalid/reserved/conflict detection and transactional
  hotkey/startup rollback
- Active, primary, and remembered monitor resolution; right-edge and remembered
  positions; removed-monitor, negative-coordinate, off-screen, width, work-area, and DPI
  recovery
- Runtime always-on-top, focus-loss close, close-after-selection, opt-in automatic paste,
  clipboard pause, and sensitive-application behavior
- System/dark/light theme palettes, Windows high-contrast override, readable owner-drawn
  controls, distinct disabled state, DPI-scaled focus, and reduced-motion hover behavior
- Keyboard-only Tab/Shift+Tab, arrows, Enter, Space, Escape, native labels/names,
  default-safe confirmations, and accessible status-change notifications
- Allowlisted token-only diagnostics that remain protected even when enabled
- Explicit reset-preserves-connection contract; disconnect remains separately confirmed

No Workstation file, Supabase migration, API function, service-role boundary, device
scope, RLS rule, Quick Paste ownership rule, or Vercel entrypoint changed.

## Settings and defaults

| Setting | Default |
| --- | --- |
| Focus Key | `#+F23` |
| Start with Windows | Off |
| Opening monitor | Active |
| Opening position | Middle right; Upper right also available |
| Launcher scale | Standard (100%); Compact (90%) and Large (115%) also available |
| Always on top | On |
| Hide the launcher when I click elsewhere | On |
| Close after choosing an item | Off |
| Automatically paste after selection | Off |
| Clipboard History capture | Active |
| Sensitive applications | KeePass, KeePassXC, 1Password, and Bitwarden executable names |
| Theme | Follow Windows |
| Redacted diagnostics | Off |
| Olio account | Disconnected on a new device; existing protected connection retained |

## Migration, recovery, reset, and credentials

Versionless files are schema 1 and migrate to schema 2. Obsolete `foreground` and `edge`
placement names become `active` and `right`. New fields receive safe defaults. Unknown
future fields and versions do not stop startup; known valid values remain usable.
Malformed JSON falls back to defaults. A corrupt/invalid source is retained as
`settings.invalid.*.json` before the next valid atomic replace.

Credentials never enter settings. If corrupt settings lose the device UUID, exactly one
current-user Olio Launcher Credential Manager target restores it. Multiple targets are
not guessed or deleted and produce recovery guidance.

Reset restores behavior defaults while preserving device UUID, safe name, connection
display metadata, and the protected credential. Its confirmation explicitly states this
and focuses No. Reset never calls revocation. Disconnect separately focuses No, revokes
the server device, and deletes the local credential only after confirmed success.

## Interaction behavior

With close and auto-paste off, Milestone 6 selection behavior is unchanged. Close-after-
selection applies to mouse, Enter, and Space choices. Explicit Copy is copy-only.

Automatic paste publishes through existing clipboard suppression, captures no new target,
hides the launcher, and invokes only the saved previous root window. Destruction, focus,
`SendInput`, or integrity failure leaves the exact item copied, gives content-free manual
recovery feedback, and never elevates. Clipboard pause blocks capture but not a deliberate
selection. “Apps ignored by Clipboard History” blocks source capture only when Windows
identifies a matching owner and never logs source or content.

## Automated results

| Check | Result |
| --- | --- |
| Focused Milestone 7 model/settings/migration/UI/accessibility/privacy/integration | Pass: 183 assertions |
| Milestone 1 foundation regression | Pass: 85 assertions |
| Milestone 5 secure connection regression | Pass: 383 assertions |
| Milestone 6 Quick Paste regression | Pass: 64 assertions |
| Clipboard Preview regression | Pass: 44 assertions |
| Milestone 3 geometry/gesture logic-only | Pass: 26 assertions |
| Launcher parse-only entrypoint | Pass, no warnings |
| Full Milestone 2 clipboard regression | Not run: resident launcher active |
| Full Milestone 3 screenshot regression/measurement | Not run: resident launcher active |
| Workstation tests | Not required: no Workstation file changed |

The focused suite uses `#SingleInstance Off`, unique temporary settings/log directories,
an isolated HKCU startup value, mock clipboard publication, mock credentials/transports,
synthetic in-memory data, and off-screen native windows. It does not acquire the
production mutex, send launcher IPC, run `Run-OlioLauncher.cmd`, read a production
credential, or touch the Windows clipboard.

## Accessibility and scaling results

- Native labels and control text cover every preference and primary action.
- Tab order is asserted from Focus Key to availability testing and across visible sections.
- Every setting has an accessible name and whole-control or label hover help; at least 17
  tooltip registrations and representative privacy/paste/account descriptions are
  asserted without adding visible help buttons.
- The launcher Settings action opens one standalone window directly; native Tab order
  proceeds through each visible tab without an intermediate page. Advanced is reachable
  from the keyboard through the overflow menu but is absent from the advertised tab row.
- Enter and native Space activate buttons; Enter and Space choose Clipboard/Quick Paste
  list items; Escape closes dialogs or returns one page.
- Owner-drawn focus remains a two-pixel DPI-scaled accent/system outline.
- Disabled controls synchronize native `Enabled` state and owner-drawn appearance.
- Status changes issue Windows accessibility name-change notifications.
- Dark and light primary/muted text contrast meet tested readable ratios.
- High contrast resolves Windows system colors instead of a forced theme.
- Motion is permanently minimized without removing functionality.
- Pure geometry verifies 96, 120, and 144 DPI width scaling and negative monitor work
  areas. The standalone Settings window and controls use native Per-Monitor V2 scaling.

## Privacy verification

- Settings serialization contains no credential, token, authorization header, protected
  content, email, or stable account field.
- Enabled and disabled diagnostic modes reject email-like, body/header/content,
  UUID-shaped, and credential-shaped inputs before disk output.
- Clipboard History still has no file/network sink and clears retained entries on
  shutdown.
- Quick Pastes still has no file writer or offline cache.
- Dynamic Screenshot source was not changed and retains `CreateFontW`/`DeleteObject`,
  in-memory GDI, and no-file behavior.
- Send to Phone and Network Analyzer remain disabled.
- Static budget verification remains at or below 12 Vercel functions.
- No real credential, account/session data, clipboard value, Quick Paste content, image
  pixel, or sensitive diagnostic value entered test output or artifacts.

## Resident launcher confirmation

A read-only process check found a normal AutoHotkey Olio Launcher resident process.
It was never stopped, restarted, replaced, toggled, signaled through IPC, reconfigured,
or used for testing. Because its Clipboard History exists only in that process, the full
Milestone 2 and Milestone 3 clipboard/screenshot suites were intentionally skipped rather
than disturbing it. The focused Milestone 7 suite used mock clipboard state.

## Nontechnical manual checklist

Use only harmless text and a disposable launcher/account if account actions are tested.
Do not stop a normal resident launcher merely to run this checklist.

1. Open the standalone Settings window directly from the launcher using only arrows and
   Enter. Confirm there is no intermediate Settings page. Close with Escape and confirm
   every focus outline is obvious.
2. Tab forward and backward through every visible section. Use Space on switches and
   arrows in each dropdown. Confirm each choice shows Saved without a Save button; type in
   a text field and confirm it saves after a short pause.
3. Hover each setting card, label, and field and confirm its description is readable.
   Confirm there are no rows of question-mark buttons.
4. Try Escape, Tab, Alt+Tab, Windows+L, and a deliberately occupied harmless test
   combination as Focus Keys. Confirm each rejected value gives a generic error and the
   prior key continues working.
5. Enable and disable Start with Windows. Confirm only the current user's
   `HKCU\...\Run\OlioLauncher` value changes and no UAC prompt appears.
6. Open **Behavior**. Test Active and Primary monitor, then verify Upper right and Middle
   right remain inside the selected work area.
7. If safe, disconnect/reconnect a secondary monitor and change 100%, 125%, and 150%
   scaling. Confirm removed/off-screen placement recovers and all text remains readable.
8. In Behavior, test Compact, Standard, and Large. Confirm the shell, cards, actions, and
   focus treatment scale together and remain visible.
9. Toggle Always on top and Hide the launcher when I click elsewhere. Confirm each changes
   immediately.
10. With both selection options off, choose harmless Clipboard and Quick Paste items.
   Confirm they copy and the panel stays open.
11. Enable Close after choosing. Confirm mouse, Enter, and Space selection close only
    after a successful copy.
12. Enable automatic paste, make Notepad the prior application, and choose a harmless
    item. Confirm only Notepad receives it. Repeat with an elevated disposable editor and
    confirm the content stays copied, manual recovery is clear, and no UAC prompt appears.
13. Pause Clipboard History, copy harmless text externally, and confirm no entry appears.
    Select an existing item and confirm deliberate copy/paste still works.
14. Add a harmless disposable executable name to exclusions and confirm only its
    clipboard capture is ignored. Confirm invalid paths and non-`.exe` entries are rejected.
15. Check Follow Windows, Dark, Light, and Windows high contrast.
    Confirm owner-drawn controls, disabled placeholders, status text, and focus remain
    readable.
16. Enable diagnostics, perform ordinary actions, and inspect only metadata tokens.
    Confirm no content, account identity, request/response body, or credential appears.
17. Choose Reset settings and read that the Olio connection is preserved; cancel once.
    Confirm reset once and verify the account remains connected. Use the separate
    Disconnect confirmation only on a disposable device.
18. Confirm Quick Paste single-search, favorite-first order, two-card accumulated wheel,
    mouse auto-copy, explicit Paste, refresh/revocation, and memory clearing are unchanged.
19. Confirm Dynamic Screenshot, Focus Key double press, Clipboard Preview, disabled Send
    to Phone, and disabled Network Analyzer remain unchanged.

## Environmental cases not exercised

- Full Clipboard History and Dynamic Screenshot suites while the real resident launcher
  was active
- Second physical monitor, true negative-origin hardware, mixed-DPI movement,
  disconnect/reconnect, alternate taskbar edges, docking, and sleep/resume
- Windows text scaling beyond the available configuration and screen-reader manual passes
- Real input into an elevated target, UAC secure desktop, and enterprise integrity policy
- Live credential recovery with multiple real Credential Manager targets
- Live account reset/disconnect on a disposable authorized device
- Supabase/pgTAP and Workstation tests, because no Workstation file changed
- Packaging, installer, updater, or execution without AutoHotkey; those belong to
  Milestone 8 and were not started
