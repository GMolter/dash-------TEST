#Requires AutoHotkey v2.0.26
#SingleInstance Off
#Warn All, StdOut

#Include ..\src\FlatJson.ahk
#Include ..\src\Logging.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
#Include ..\src\CryptoRandom.ahk
#Include ..\src\CredentialStore.ahk
#Include ..\src\LauncherConnection.ahk
#Include ..\src\QuickPastesClient.ahk
#Include ..\src\WindowsInterop.ahk
#Include ..\src\HotkeyManager.ahk
#Include ..\src\StartupManager.ahk
#Include ..\src\ClipboardManager.ahk
#Include ..\src\Navigation.ahk
#Include ..\src\TileRenderer.ahk
#Include ..\src\ClipboardRenderer.ahk
#Include ..\src\QuickPastesRenderer.ahk
#Include ..\src\CalendarRenderer.ahk
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk

class M7ClipboardEntry {
    __New() {
        this.Kind := "text"
        this.DisplayTime := "Now"
        this.Pinned := false
    }

    SafePreview(*) => "Synthetic preview"
}

class M7Clipboard {
    __New() {
        this.Entries := [M7ClipboardEntry()]
        this.Published := []
        this.Paused := false
        this.Exclusions := ""
        this.Restored := 0
    }

    PublishText(text) {
        this.Published.Push(text)
        return true
    }

    RestoreAndPromote(index) {
        this.Restored := index
        return index = 1
    }

    ApplySettings(settings) {
        this.Paused := settings["clipboardPaused"]
        this.Exclusions := settings["sensitiveApplications"]
    }

    ReleasePreviews() {
    }
}

class Milestone7Tests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static Area(handle, name, left, top, right, bottom, dpi, primary := false) {
        return {
            Handle: handle, Name: name, Left: left, Top: top,
            Right: right, Bottom: bottom, Dpi: dpi, Primary: primary
        }
    }

    static Run() {
        originalDir := SettingsManager.SettingsDir
        originalPath := SettingsManager.SettingsPath
        originalValues := SettingsManager.Values
        originalLogDir := RedactedLogger.LogDir
        originalLogFile := RedactedLogger.LogFile
        originalStartupName := StartupManager.ValueName
        testRoot := A_ScriptDir "\generated-m7-"
            DllCall("GetCurrentProcessId", "uint") "-" A_TickCount
        DirCreate(testRoot)
        try {
            SettingsManager.SettingsDir := testRoot "\settings"
            SettingsManager.SettingsPath := SettingsManager.SettingsDir "\settings.json"
            RedactedLogger.LogDir := testRoot "\logs"
            RedactedLogger.LogFile := RedactedLogger.LogDir "\launcher.log"
            StartupManager.ValueName := "OlioLauncher-M7-Test-"
                DllCall("GetCurrentProcessId", "uint") "-" A_TickCount

            this.TestDefaultsAndValidation()
            this.TestPersistenceMigrationAndRecovery()
            this.TestSafeReset()
            this.TestHotkeys()
            this.TestStartup()
            this.TestMonitorPositionWidthAndDpi()
            this.TestClipboardSettings()
            this.TestThemeMotionAndContrast()
            this.TestInteractionPolicies()
            this.TestNativeUiAndAccessibility()
            this.TestDiagnosticsAndPrivacy(testRoot)
            this.TestRegressionBoundaries()
        } finally {
            HotkeyManager.Unregister()
            try RegDelete(StartupManager.RegistryPath, StartupManager.ValueName)
            RedactedLogger.Configure(false)
            try DirDelete(testRoot, true)
            SettingsManager.SettingsDir := originalDir
            SettingsManager.SettingsPath := originalPath
            SettingsManager.Values := originalValues
            SettingsManager.InvalidSource := false
            RedactedLogger.LogDir := originalLogDir
            RedactedLogger.LogFile := originalLogFile
            StartupManager.ValueName := originalStartupName
            ThemeManager.Configure(SettingsManager.Defaults())
        }
        this.WriteResult("PASS", this.Passed " assertions")
        ExitApp(0)
    }

    static TestDefaultsAndValidation() {
        defaults := SettingsManager.Defaults()
        expected := Map(
            "settingsSchemaVersion", 2,
            "focusKey", "#+F23",
            "startWithWindows", false,
            "openingMonitor", "active",
            "openingPosition", "middle-right",
            "launcherScale", "standard",
            "panelWidth", 360,
            "alwaysOnTop", true,
            "closeOnFocusLost", true,
            "closeAfterSelection", false,
            "autoPasteAfterSelection", false,
            "clipboardPaused", false,
            "sensitiveApplications",
                "KeePass.exe;KeePassXC.exe;1Password.exe;Bitwarden.exe",
            "theme", "system",
            "reducedMotion", true,
            "loggingEnabled", false,
            "lastSelected", "clipboard",
            "rememberedMonitor", "",
            "rememberedX", 0,
            "rememberedY", 0,
            "rememberedPositionValid", false,
            "deviceId", "",
            "connectedDeviceName", "",
            "connectedAt", ""
        )
        for key, value in expected
            this.Assert(defaults[key] = value, "Unexpected default for " key ".")
        this.Assert(StrLen(defaults["deviceName"]) >= 1
            && StrLen(defaults["deviceName"]) <= 80,
            "Default device name is invalid.")

        invalid := Map(
            "settingsSchemaVersion", 0,
            "focusKey", "",
            "startWithWindows", "yes",
            "openingMonitor", "removed",
            "openingPosition", "floating",
            "launcherScale", "enormous",
            "panelWidth", 279,
            "alwaysOnTop", "yes",
            "closeOnFocusLost", 2,
            "closeAfterSelection", "no",
            "autoPasteAfterSelection", "yes",
            "clipboardPaused", -1,
            "sensitiveApplications", "C:\private\Vault.exe",
            "theme", "purple",
            "reducedMotion", "yes",
            "loggingEnabled", "yes",
            "rememberedX", 100001,
            "rememberedY", -100001,
            "rememberedPositionValid", "yes"
        )
        SettingsManager.Warnings := []
        recovered := SettingsManager.Validate(invalid)
        for key, value in defaults {
            if recovered.Has(key) && key != "deviceName"
                this.Assert(recovered[key] = value,
                    "Invalid " key " did not recover to its safe default.")
        }
        this.Assert(SettingsManager.Warnings.Length >= 17,
            "Invalid settings did not report content-free recovery warnings.")

        normalized := SettingsManager.NormalizeSensitiveApplications(
            "KeePass.exe;keepass.EXE;My Vault.exe")
        this.Assert(normalized.Ok
            && normalized.Value = "KeePass.exe;My Vault.exe",
            "Sensitive-application normalization or deduplication failed.")
        for invalidList in ["folder\Vault.exe", "../Vault.exe", "Vault",
            "Vault.exe;bad`nname.exe"]
            this.Assert(!SettingsManager.NormalizeSensitiveApplications(invalidList).Ok,
                "An invalid sensitive-application exclusion was accepted.")
    }

    static TestPersistenceMigrationAndRecovery() {
        SettingsManager.Values := SettingsManager.Defaults()
        SettingsManager.Save()
        loaded := SettingsManager.Load()
        this.Assert(loaded["settingsSchemaVersion"] = 2,
            "Saved schema version did not reload.")
        this.Assert(loaded["panelWidth"] = 360
            && loaded["autoPasteAfterSelection"] = false,
            "Settings save/reload changed values.")

        FileDelete(SettingsManager.SettingsPath)
        legacy := '{"focusKey":"^!F24","panelWidth":420,'
            . '"openingMonitor":"foreground","openingPosition":"edge",'
            . '"futureField":"ignored"}'
        FileAppend(legacy, SettingsManager.SettingsPath, "UTF-8")
        migrated := SettingsManager.Load()
        this.Assert(migrated["settingsSchemaVersion"] = 2
            && migrated["focusKey"] = "^!F24"
            && migrated["launcherScale"] = "large"
            && migrated["panelWidth"] = 414,
            "Version 1 settings were not migrated.")
        this.Assert(migrated["openingMonitor"] = "active"
            && migrated["openingPosition"] = "middle-right"
            && SettingsManager.Migrated,
            "Obsolete placement values did not migrate safely.")
        this.Assert(!migrated.Has("futureField"),
            "Unknown fields entered the validated runtime settings model.")

        FileDelete(SettingsManager.SettingsPath)
        FileAppend('{"settingsSchemaVersion":99,"panelWidth":400,'
            . '"unknownFutureSetting":true}', SettingsManager.SettingsPath, "UTF-8")
        future := SettingsManager.Load()
        this.Assert(future["launcherScale"] = "large"
            && future["panelWidth"] = 414
            && future["settingsSchemaVersion"] = 2,
            "A future settings document caused startup failure or lost known values.")

        FileDelete(SettingsManager.SettingsPath)
        FileAppend("{not-json", SettingsManager.SettingsPath, "UTF-8")
        corrupt := SettingsManager.Load()
        this.Assert(corrupt["panelWidth"] = 360
            && SettingsManager.InvalidSource,
            "Corrupt settings did not recover safely.")
        SettingsManager.Update("panelWidth", 400)
        this.Assert(SettingsManager.LastInvalidBackupPath
            && FileExist(SettingsManager.LastInvalidBackupPath),
            "The corrupt source was not preserved before a valid replacement.")

        SettingsManager.InvalidSource := true
        LauncherConnection.IdentityResolver := () =>
            ["aaaaaaaa-0000-4000-8000-000000000001"]
        identitySettings := SettingsManager.Defaults()
        identitySettings["deviceId"] := ""
        originalSettingsValues := SettingsManager.Values
        SettingsManager.Values := identitySettings
        manager := LauncherConnection(identitySettings, 0,
            {Read: (*) => "", Write: (*) => true, Delete: (*) => true},
            {Cancel: (*) => 0}, (*) => 0)
        this.Assert(identitySettings["deviceId"]
            = "aaaaaaaa-0000-4000-8000-000000000001",
            "Corrupt settings did not recover the single protected credential identity.")
        manager.Shutdown()
        LauncherConnection.IdentityResolver := 0
        SettingsManager.InvalidSource := false
        SettingsManager.Values := originalSettingsValues
    }

    static TestSafeReset() {
        values := SettingsManager.Defaults()
        values["panelWidth"] := 600
        values["autoPasteAfterSelection"] := true
        values["deviceId"] := "aaaaaaaa-0000-4000-8000-000000000001"
        values["deviceName"] := "Connected synthetic launcher"
        values["connectedDeviceName"] := "Connected synthetic launcher"
        values["connectedAt"] := "2026-07-18T12:00:00Z"
        SettingsManager.Values := values
        reset := SettingsManager.ResetPreservingConnection()
        this.Assert(reset["panelWidth"] = 360
            && reset["autoPasteAfterSelection"] = false,
            "Settings reset did not restore safe behavior defaults.")
        for key in ["deviceId", "deviceName", "connectedDeviceName", "connectedAt"]
            this.Assert(reset[key] = values[key],
                "Safe reset did not explicitly preserve " key ".")
        serialized := SettingsManager.Serialize(reset)
        this.Assert(!InStr(serialized, "credential")
            && !InStr(serialized, "token")
            && !InStr(serialized, "authorization"),
            "Settings serialization gained a protected-secret field.")
    }

    static TestHotkeys() {
        for reserved in ["Escape", "Tab", "!Tab", "^!Delete", "#l", "LWin"]
            this.Assert(!HotkeyManager.Validate(reserved).Ok,
                "A reserved Focus Key was accepted.")
        this.Assert(!HotkeyManager.Validate("DefinitelyNotAKey").Ok,
            "An unusable Focus Key was accepted.")
        callback := (*) => 0
        release := (*) => 0
        result := HotkeyManager.Register("^!+F24", callback, release)
        this.Assert(result.Ok && HotkeyManager.RegisteredKey = "^!+F24",
            "An isolated valid Focus Key did not register.")
        this.Assert(HotkeyManager.RegisteredReleaseKey = "^!+F24 up",
            "Focus Key release registration is missing.")
        failed := HotkeyManager.Register("#l", callback, release)
        this.Assert(!failed.Ok
            && !InStr(failed.Status, "#l")
            && !InStr(failed.Status, "Error:"),
            "Rejected Focus Key feedback was not content-free.")
        HotkeyManager.Unregister()
    }

    static TestStartup() {
        this.Assert(InStr(StartupManager.RegistryPath, "HKCU\") = 1,
            "Startup registration is not per-user.")
        enabled := StartupManager.Apply(true)
        this.Assert(enabled.Ok
            && RegRead(StartupManager.RegistryPath, StartupManager.ValueName)
                = StartupManager.Command(),
            "Isolated start-with-Windows registration failed.")
        this.Assert(InStr(StartupManager.Command(), "--background"),
            "Startup command does not use background mode.")
        disabled := StartupManager.Apply(false)
        missing := false
        try RegRead(StartupManager.RegistryPath, StartupManager.ValueName)
        catch
            missing := true
        this.Assert(disabled.Ok && missing,
            "Isolated start-with-Windows removal failed.")
    }

    static TestMonitorPositionWidthAndDpi() {
        primary := this.Area(101, "PRIMARY", 0, 0, 1920, 1040, 96, true)
        left := this.Area(202, "LEFT", -1600, -200, 0, 900, 144, false)
        areas := [primary, left]
        this.Assert(WindowsInterop.SelectWorkArea(areas, "primary").Name = "PRIMARY",
            "Primary monitor selection failed.")
        this.Assert(WindowsInterop.SelectWorkArea(areas, "active", 0, "", 0, 0,
            false, 202).Name = "LEFT",
            "Active monitor selection failed.")
        this.Assert(WindowsInterop.SelectWorkArea(areas, "remembered", 0, "LEFT")
            .Name = "LEFT", "Remembered monitor selection failed.")
        recovered := WindowsInterop.SelectWorkArea(areas, "remembered", 0,
            "REMOVED", -1400, 100, true)
        this.Assert(recovered.Name = "LEFT",
            "Removed-monitor recovery did not choose the nearest usable work area.")

        clamped := WindowsInterop.ClampWindowPosition(left,
            -5000, 5000, 900, 600)
        this.Assert(clamped.X = -1600 && clamped.Y = 300 && clamped.Recovered,
            "Off-screen coordinates were not clamped into the work area.")
        oversized := WindowsInterop.ClampWindowPosition(primary, 10, 10, 5000, 5000)
        this.Assert(oversized.Width = 1920 && oversized.Height = 1040,
            "Oversized panel dimensions did not recover to the work area.")

        settings := SettingsManager.Defaults()
        for width in [SettingsManager.MinimumPanelWidth,
            SettingsManager.MaximumPanelWidth] {
            settings["panelWidth"] := width
            geometry := WindowsInterop.ResolveOpeningGeometry(settings, 500, 0,
                [primary])
            this.Assert(geometry.X = primary.Right - width
                && geometry.Width = width,
                "Right-edge placement failed at a panel-width boundary.")
        }
        settings["panelWidth"] := 360
        settings["openingMonitor"] := "remembered"
        settings["rememberedMonitor"] := "LEFT"
        settings["openingPosition"] := "remembered"
        settings["rememberedPositionValid"] := true
        settings["rememberedX"] := -1200
        settings["rememberedY"] := 50
        geometry := WindowsInterop.ResolveOpeningGeometry(settings, 500, 0, areas)
        this.Assert(geometry.X = -1200 && geometry.Y = 50
            && geometry.Width = 540,
            "Remembered position or 150% DPI width scaling failed.")
        for dpi, expectedWidth in Map(96, 360, 120, 450, 144, 540) {
            area := this.Area(dpi, "DPI" dpi, 0, 0, 2000, 1200, dpi, true)
            settings["openingMonitor"] := "primary"
            settings["openingPosition"] := "right"
            geometry := WindowsInterop.ResolveOpeningGeometry(settings, 500, 0, [area])
            this.Assert(geometry.Width = expectedWidth,
                "Panel width did not scale at " dpi " DPI.")
        }
        anchorExpectations := Map(
            "top-left", [0, 0], "top-center", [820, 0],
            "top-right", [1640, 0], "middle-left", [0, 350],
            "middle-center", [820, 350], "middle-right", [1640, 350],
            "bottom-left", [0, 700], "bottom-center", [820, 700],
            "bottom-right", [1640, 700]
        )
        for anchor, expected in anchorExpectations {
            coordinates := WindowsInterop.OpeningCoordinates(
                this.Area(909, "ANCHOR", 0, 0, 2000, 1200, 96, true),
                360, 500, anchor)
            this.Assert(coordinates.X = expected[1] && coordinates.Y = expected[2],
                "Opening anchor failed for " anchor ".")
        }
    }

    static TestClipboardSettings() {
        settings := SettingsManager.Defaults()
        manager := ClipboardManager(settings)
        manager.CaptureText("Synthetic first", "Editor.exe")
        this.Assert(manager.Entries.Length = 1,
            "Clipboard model did not accept harmless in-memory text.")
        manager.SetPaused(true)
        manager.CaptureText("Synthetic paused", "Editor.exe")
        this.Assert(manager.Entries.Length = 1 && manager.Paused,
            "Clipboard capture pause did not block capture.")
        settings["clipboardPaused"] := false
        settings["sensitiveApplications"] := "Vault.exe"
        manager.ApplySettings(settings)
        manager.CaptureText("Synthetic excluded", "VAULT.EXE")
        this.Assert(manager.Entries.Length = 1 && !manager.Paused,
            "Sensitive-application exclusion did not block capture after resume.")
        manager.CaptureText("Synthetic resumed", "Editor.exe")
        this.Assert(manager.Entries.Length = 2,
            "Clipboard capture did not resume after settings changed.")
        manager.Shutdown()
        this.Assert(manager.Entries.Length = 0,
            "Clipboard History did not release its memory-only entries.")
    }

    static TestThemeMotionAndContrast() {
        darkSettings := SettingsManager.Defaults()
        darkSettings["theme"] := "dark"
        ThemeManager.Configure(darkSettings)
        this.Assert(ThemeManager.Mode = "dark"
            && ThemeManager.ContrastRatio(ThemeManager.Color("Text"),
                ThemeManager.Color("Window")) >= 7,
            "Dark theme text contrast is not readable.")
        this.Assert(ThemeManager.ContrastRatio(ThemeManager.Color("MutedText"),
            ThemeManager.Color("Window")) >= 4.5,
            "Dark theme muted-text contrast is not readable.")
        lightSettings := SettingsManager.Defaults()
        lightSettings["theme"] := "light"
        ThemeManager.Configure(lightSettings)
        this.Assert(ThemeManager.Mode = "light"
            && ThemeManager.ContrastRatio(ThemeManager.Color("Text"),
                ThemeManager.Color("Window")) >= 7,
            "Light theme text contrast is not readable.")
        this.Assert(ThemeManager.ContrastRatio(ThemeManager.Color("MutedText"),
            ThemeManager.Color("Window")) >= 4.5,
            "Light theme muted-text contrast is not readable.")

        lightSettings["reducedMotion"] := false
        ThemeManager.Configure(lightSettings)
        this.Assert(ThemeManager.ReducedMotion,
            "Motion was re-enabled by a legacy settings value.")
        window := LauncherWindow(lightSettings, (*) => 0, true)
        TileRenderer.HoveredHwnd := 0
        TileRenderer.OnMouseMove(0, 0, 0, window.Buttons["clipboard"].Hwnd)
        this.Assert(TileRenderer.HoveredHwnd = 0,
            "Reduced motion did not suppress nonessential hover transitions.")
        window.Gui.Destroy()
    }

    static TestInteractionPolicies() {
        settings := SettingsManager.Defaults()
        settings["closeAfterSelection"] := true
        clipboard := M7Clipboard()
        window := LauncherWindow(settings, (*) => 0, true, clipboard)
        window.Gui.Show("NA x-10000 y-10000 w360 h500")
        window.ActivateClipboardSelection(1)
        this.Assert(clipboard.Restored = 1 && !window.IsVisible(),
            "Close-after-selection did not close after a Clipboard choice.")
        window.Gui.Destroy()

        settings := SettingsManager.Defaults()
        settings["autoPasteAfterSelection"] := true
        clipboard := M7Clipboard()
        window := LauncherWindow(settings, (*) => 0, true, clipboard)
        item := LauncherQuickPaste("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            "Synthetic", "Synthetic publication", "", 0, false)
        window.QuickVisibleItems := [item]
        targetUsed := 0
        window.PreviousForeground := 424242
        window.PasteRunner := (target) => (targetUsed := target, false)
        window.Gui.Show("NA x-10000 y-10000 w360 h500")
        result := window.ChooseQuickPasteSelection(1)
        this.Assert(!result && targetUsed = 424242,
            "Automatic paste did not target only the previously active application.")
        this.Assert(clipboard.Published.Length = 1
            && clipboard.Published[1] = "Synthetic publication",
            "Automatic paste did not reuse clipboard publication.")
        this.Assert(InStr(window.QuickLastFeedback, "Paste manually"),
            "Safe automatic-paste failure did not preserve manual recovery feedback.")
        this.Assert(!window.IsVisible(),
            "Automatic paste did not leave the arbitrary launcher window out of focus.")
        window.Gui.Destroy()
    }

    static TestNativeUiAndAccessibility() {
        settings := SettingsManager.Defaults()
        window := LauncherWindow(settings, (*) => 0, true, M7Clipboard())
        this.Assert(window.Buttons["settings"].Text = "Settings"
            && !window.PageDefinitions.Has("settings"),
            "Settings still routes through an intermediate launcher page.")
        this.Assert(window.Buttons["calendar"].Enabled
            && !window.Buttons["networkAnalyzer"].Enabled,
            "Calendar or deferred Network control state is incorrect.")
        this.Assert(window.AutoCloseOnDeactivate = false,
            "Visual-test isolation did not disable focus-loss close.")
        style := DllCall("GetWindowLongPtrW", "ptr", window.Gui.Hwnd,
            "int", -20, "ptr")
        this.Assert((style & 0x8) != 0,
            "Always-on-top default was not applied.")
        runtimeSettings := Map()
        for key, value in settings
            runtimeSettings[key] := value
        runtimeSettings["alwaysOnTop"] := false
        runtimeSettings["launcherScale"] := "large"
        runtimeSettings["panelWidth"] := 414
        runtimeSettings["openingMonitor"] := "primary"
        runtimeSettings["openingPosition"] := "top-right"
        window.ApplyRuntimeSettings(runtimeSettings)
        runtimeStyle := DllCall("GetWindowLongPtrW", "ptr", window.Gui.Hwnd,
            "int", -20, "ptr")
        this.Assert((runtimeStyle & 0x8) = 0 && window.LogicalWidth = 414
            && window.Settings["openingMonitor"] = "primary"
            && window.Settings["openingPosition"] = "top-right",
            "Behavior settings were not applied to the running launcher model.")

        saveCalls := []
        applied := (action, changes) => (
            saveCalls.Push({Action: action, Changes: changes}),
            {Ok: true, Values: changes})
        dialog := SettingsDialog(window.Gui, settings, applied, 0, true)
        this.Assert(dialog.Gui.Title = "Olio Launcher Settings"
            && (DllCall("GetWindowLongPtrW", "ptr", dialog.Gui.Hwnd,
                "int", -20, "ptr") & 0x80) = 0,
            "Settings is not a normal standalone application window.")
        this.Assert(SettingsDialog.LogicalWidth = 780
            && SettingsDialog.LogicalHeight = 620
            && dialog.Pages.Count = 6,
            "Settings is not the Fluent six-section window.")
        this.Assert(dialog.AccessibleNames.Count >= 24,
            "Primary preference controls lack explicit accessible names.")
        for hwnd, name in dialog.AccessibleNames
            this.Assert(hwnd && StrLen(name) >= 3,
                "A preference control has an unusable accessible name.")
        this.Assert(SettingsRenderer.Items[dialog.FocusKeyRecorder.Hwnd].Kind = "hotkey"
            && SettingsRenderer.Items[dialog.FocusKeyRecorder.Hwnd].Value
                = "Windows + Shift + F23",
            "Focus Key is not presented as a readable shortcut recorder.")
        this.Assert(SettingsRenderer.Items[dialog.ResetButton.Hwnd].Title = "Reset settings"
            && dialog.SidebarHint.Text = "Every change saves automatically.",
            "Auto-saving Settings actions lack useful native names.")
        this.Assert(SettingsRenderer.Items[dialog.CloseOnFocusLostCheck.Hwnd].Title
            = "Hide on click away"
            && dialog.ToggleValues["closeOnFocusLost"],
            "Click-away hiding is not clearly named or safely enabled by default.")
        this.Assert(dialog.Tooltips.Tools.Length >= 17
            && dialog.Tooltips.Tools.Length = dialog.Tooltips.Descriptions.Length,
            "Settings features do not all have unobtrusive hover help.")
        tooltipText := ""
        for description in dialog.Tooltips.Descriptions
            tooltipText .= description "`n"
        this.Assert(InStr(tooltipText, "listed executable")
            && InStr(tooltipText, "previously active app")
            && InStr(tooltipText, "Credential Manager"),
            "Settings tooltips do not explain privacy, paste, and account behavior.")
        this.Assert(dialog.Tabs.Has("advanced") && dialog.Tabs.Has("behavior")
            && dialog.Tabs.Has("appearance")
            && SettingsRenderer.Items[dialog.Tabs["advanced"].Hwnd].Kind = "nav",
            "Settings navigation does not expose all primary destinations.")
        switchStarted := A_TickCount
        Loop 20
            dialog.ShowSection(Mod(A_Index, 2) ? "clipboard" : "general")
        this.Assert(A_TickCount - switchStarted < 1000,
            "Settings section switching is unexpectedly slow.")
        dialog.ShowSection("clipboard")
        this.Assert(dialog.SensitiveList.Visible && !dialog.FocusKeyRecorder.Visible,
            "Settings section navigation did not show only the selected section.")
        this.Assert(dialog.AddSensitiveExecutableName("SyntheticApp.exe")
            && InStr(dialog.SensitiveEdit.Value, "SyntheticApp.exe")
            && DllCall("SendMessageW", "ptr", dialog.SensitiveList.Hwnd,
                "uint", 0x018B, "ptr", 0, "ptr", 0) = 5,
            "Executable exclusions are not managed as a normalized list.")
        dialog.SensitiveList.Choose(5)
        this.Assert(dialog.RemoveSensitiveExecutable()
            && !InStr(dialog.SensitiveEdit.Value, "SyntheticApp.exe")
            && DllCall("SendMessageW", "ptr", dialog.SensitiveList.Hwnd,
                "uint", 0x018B, "ptr", 0, "ptr", 0) = 4,
            "Executable exclusion removal did not update serialization.")
        dialog.ShowSection("account")
        this.Assert(SettingsRenderer.Items[dialog.ConnectButton.Hwnd].Title
            = "Connect Olio account"
            && dialog.DeviceNameEdit.Value != "" && dialog.DeviceNameEdit.Visible,
            "The standalone Settings window lacks Olio account controls.")
        this.Assert(!dialog.ConnectButton.Enabled,
            "Unavailable isolated account controls are not programmatically disabled.")
        dialog.ShowSection("general")
        priorSaves := saveCalls.Length
        dialog.ToggleSetting("startWithWindows", dialog.StartWithWindowsCheck)
        this.Assert(saveCalls.Length = priorSaves + 1
            && saveCalls[saveCalls.Length].Action = "save"
            && saveCalls[saveCalls.Length].Changes["startWithWindows"]
            && dialog.Status.Text = "Saved",
            "Selecting a setting did not save it immediately.")
        dialog.ShowSection("behavior")
        dialog.SelectSegment("openingMonitor", "primary", dialog.MonitorList)
        this.Assert(saveCalls[saveCalls.Length].Changes["openingMonitor"] = "primary",
            "Opening-monitor selection did not save through the behavior UI.")
        dialog.SelectPlacement("top-right")
        this.Assert(saveCalls[saveCalls.Length].Changes["openingPosition"] = "top-right"
            && dialog.OpeningPositionValue = "top-right",
            "Opening-position picker did not save the selected anchor.")
        behaviorToggles := Map(
            "alwaysOnTop", dialog.AlwaysOnTopCheck,
            "closeOnFocusLost", dialog.CloseOnFocusLostCheck,
            "closeAfterSelection", dialog.CloseAfterSelectionCheck,
            "autoPasteAfterSelection", dialog.AutoPasteCheck
        )
        for key, control in behaviorToggles {
            originalValue := dialog.ToggleValues[key]
            dialog.ToggleSetting(key, control)
            this.Assert(saveCalls[saveCalls.Length].Changes[key] = !originalValue,
                key " did not save through the behavior UI.")
            dialog.ToggleSetting(key, control)
            this.Assert(saveCalls[saveCalls.Length].Changes[key] = originalValue,
                key " did not restore through the behavior UI.")
        }
        dialog.ScaleList.Choose(3)
        dialog.QueueAutoSave(true)
        this.Assert(saveCalls[saveCalls.Length].Changes["launcherScale"] = "large"
            && saveCalls[saveCalls.Length].Changes["panelWidth"] = 414,
            "Launcher scale selection did not save its compatible dimensions.")
        candidate := dialog.Candidate()
        this.Assert(candidate.Ok
            && candidate.Values["autoPasteAfterSelection"] = false
            && candidate.Values["reducedMotion"] = true,
            "The native dialog did not model the opt-in auto-paste default.")
        dialog.Close()

        foreignWindow := Gui()
        this.Assert(!LauncherWindow.ShouldCloseAfterFocusLoss(
                window.SettingsLabel.Hwnd, window.Gui.Hwnd)
            && LauncherWindow.ShouldCloseAfterFocusLoss(
                foreignWindow.Hwnd, window.Gui.Hwnd),
            "Click-away detection cannot distinguish launcher and outside windows.")
        foreignWindow.Destroy()

        window.Activate("settings")
        this.Assert(IsObject(window.SettingsDialog)
            && window.SettingsDialog.IsVisible(),
            "The launcher Settings action did not open the standalone window directly.")
        window.CloseSettingsDialog()
        window.Gui.Destroy()
    }

    static TestDiagnosticsAndPrivacy(testRoot) {
        forbiddenEmail := "owner" Chr(64) "example.invalid"
        secretShape := ""
        Loop 64
            secretShape .= "a"
        RedactedLogger.Configure(false)
        RedactedLogger.Write("navigation", "clipboard")
        this.Assert(!FileExist(RedactedLogger.LogFile),
            "Disabled diagnostics created a log.")
        RedactedLogger.Configure(true)
        RedactedLogger.Write("navigation", forbiddenEmail)
        RedactedLogger.Write("capture-result", "ok")
        RedactedLogger.Write("unknown-event", "safe")
        diagnosticText := FileRead(RedactedLogger.LogFile, "UTF-8")
        this.Assert(InStr(diagnosticText, "redacted")
            && !InStr(diagnosticText, forbiddenEmail)
            && !InStr(diagnosticText, "unknown-event"),
            "Enabled diagnostics retained forbidden or non-allowlisted data.")
        for forbidden in ["Bearer", "authorization", "request-body",
            secretShape]
            this.Assert(RedactedLogger.SafeToken(forbidden) = "redacted",
                "Diagnostics accepted a forbidden token shape.")

        settingsText := FileRead(SettingsManager.SettingsPath, "UTF-8")
        for forbidden in ["credential", "accessToken", "authorizationHeader",
            "quickPasteContent", "clipboardContent", "emailAddress", "accountId"]
            this.Assert(!InStr(settingsText, forbidden),
                "A forbidden protected field entered settings.")

        clipboardSource := FileRead(A_ScriptDir "\..\src\ClipboardManager.ahk", "UTF-8")
        quickSource := FileRead(A_ScriptDir "\..\src\QuickPastesClient.ahk", "UTF-8")
        screenshotSource := FileRead(A_ScriptDir "\..\src\ScreenshotManager.ahk", "UTF-8")
        this.Assert(!RegExMatch(clipboardSource,
            "i)FileAppend|FileOpen|FileWrite|FileMove|FileCopy|WinHttp|URLDownload"),
            "Clipboard History gained a persistence or network sink.")
        this.Assert(!RegExMatch(quickSource,
            "i)FileAppend|FileOpen|FileWrite|FileMove|FileCopy|DirCreate|offline.?cache"),
            "Quick Pastes gained an offline cache or persistence sink.")
        this.Assert(InStr(screenshotSource, "ScreenshotManager.CreateFont")
            && InStr(screenshotSource, "DllCall(" Chr(34) "CreateFontW" Chr(34))
            && InStr(screenshotSource, "DllCall(" Chr(34) "DeleteObject" Chr(34)),
            "Dynamic Screenshot Win32 font creation/cleanup changed unexpectedly.")
        this.Assert(!InStr(screenshotSource, "SettingsManager")
            && !InStr(screenshotSource, "ThemeManager"),
            "Milestone 7 changed Dynamic Screenshot behavior.")

        artifacts := ""
        Loop Files testRoot "\*", "FR"
            artifacts .= FileRead(A_LoopFileFullPath, "UTF-8")
        this.Assert(!InStr(artifacts, forbiddenEmail),
            "Forbidden diagnostic content entered isolated test artifacts.")
    }

    static TestRegressionBoundaries() {
        launcherSource := FileRead(A_ScriptDir "\..\src\LauncherWindow.ahk", "UTF-8")
        quickSource := FileRead(A_ScriptDir "\..\src\QuickPastesClient.ahk", "UTF-8")
        this.Assert(!InStr(launcherSource, "QuickCategoryList")
            && InStr(launcherSource, "QuickWheelRemainder")
            && InStr(launcherSource, "OnQuickPasteMouseWheel"),
            "Milestone 6 search or wheel behavior regressed.")
        this.Assert(InStr(launcherSource, "this.ClipboardManager.PublishText")
            && InStr(launcherSource, "this.PreviousForeground"),
            "Quick Paste copy/paste suppression or previous-target behavior regressed.")
        this.Assert(InStr(quickSource, "favorites := [], regular := []"),
            "Favorite-first stable grouping regressed.")
        this.Assert(!RegExMatch(launcherSource,
            "i)__quick_(create|edit|delete|reorder|favorite)"),
            "Launcher gained forbidden Quick Paste management.")
        this.Assert(InStr(launcherSource,
            'Key: "calendar"') && InStr(launcherSource, 'Title: "Calendar"')
            && InStr(launcherSource, 'Key: "networkAnalyzer"'),
            "Calendar replacement or deferred Network definition is missing.")

        functionCount := 0
        apiRoot := A_ScriptDir "\..\..\OlioWorkstation\api"
        Loop Files apiRoot "\*.ts", "FR" {
            if InStr(A_LoopFileFullPath, "\api\_")
                || InStr(A_LoopFileFullPath, ".test.")
                continue
            functionCount += 1
        }
        this.Assert(functionCount <= 12,
            "The Workstation Vercel function budget exceeded 12.")
    }

    static WriteResult(status, detail) {
        FileAppend("MILESTONE7_TEST`t" status "`t" detail "`n", "*", "UTF-8")
    }
}

try Milestone7Tests.Run()
catch as testError {
    detail := testError.Message " @ " testError.File ":" testError.Line
    Milestone7Tests.WriteResult("FAIL",
        SubStr(RegExReplace(detail, "[\r\n\t]", " "), 1, 240))
    ExitApp(1)
}
