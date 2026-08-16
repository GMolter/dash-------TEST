#Requires AutoHotkey v2.0.26
#Warn All, StdOut

#Include ..\src\FlatJson.ahk
#Include ..\src\Logging.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
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

class Milestone1Tests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static Run() {
        parsed := FlatJson.Parse('{"name":"Olio\\Launcher","enabled":true,"width":360}')
        this.Assert(parsed["name"] = "Olio\Launcher", "JSON string escaping failed.")
        this.Assert(parsed["enabled"] = true, "JSON Boolean parsing failed.")
        this.Assert(parsed["width"] = 360, "JSON number parsing failed.")

        defaults := SettingsManager.Defaults()
        this.Assert(defaults["focusKey"] = "#+F23", "Unexpected default Focus Key.")
        this.Assert(defaults["startWithWindows"] = false, "Startup must default off.")
        this.Assert(defaults["loggingEnabled"] = false, "Logging must default off.")
        this.Assert(defaults["closeOnFocusLost"] = true, "Click-away close must default on.")
        this.Assert(defaults["clipboardPaused"] = false, "Clipboard capture must default active.")
        this.Assert(InStr(defaults["sensitiveApplications"], "KeePass.exe"),
            "Sensitive-application defaults are missing.")

        SettingsManager.Warnings := []
        invalid := Map("panelWidth", 9999, "focusKey", "", "alwaysOnTop", "yes")
        recovered := SettingsManager.Validate(invalid)
        this.Assert(recovered["panelWidth"] = 360, "Invalid panel width did not recover.")
        this.Assert(recovered["focusKey"] = "#+F23", "Invalid Focus Key did not recover.")
        this.Assert(recovered["alwaysOnTop"] = true, "Invalid Boolean did not recover.")
        this.Assert(SettingsManager.Warnings.Length = 3, "Expected three validation warnings.")

        serialized := SettingsManager.Serialize(defaults)
        roundTrip := FlatJson.Parse(serialized)
        this.Assert(roundTrip["openingMonitor"] = "active", "Settings round trip failed.")
        this.Assert(roundTrip["panelWidth"] = 360, "Numeric round trip failed.")
        this.Assert(roundTrip["clipboardPaused"] = false,
            "Clipboard pause setting did not round trip.")
        this.Assert(roundTrip["sensitiveApplications"] = defaults["sensitiveApplications"],
            "Sensitive-application setting did not round trip.")
        trailingRejected := false
        try FlatJson.Parse("{} unexpected")
        catch
            trailingRejected := true
        this.Assert(trailingRejected, "Trailing JSON data was accepted.")

        originalDir := SettingsManager.SettingsDir
        originalPath := SettingsManager.SettingsPath
        testDir := A_ScriptDir "\generated-settings-" DllCall("GetCurrentProcessId", "uint")
        try {
            SettingsManager.SettingsDir := testDir
            SettingsManager.SettingsPath := testDir "\settings.json"
            SettingsManager.Values := defaults
            SettingsManager.Save()
            this.Assert(FileExist(SettingsManager.SettingsPath), "Atomic settings save produced no file.")
            saved := FlatJson.Parse(FileRead(SettingsManager.SettingsPath, "UTF-8"))
            this.Assert(saved["focusKey"] = "#+F23", "Saved settings could not be parsed.")
            FileDelete(SettingsManager.SettingsPath)
            FileAppend("{not-json", SettingsManager.SettingsPath, "UTF-8")
            loaded := SettingsManager.Load()
            this.Assert(loaded["panelWidth"] = 360, "Malformed settings did not recover.")
            this.Assert(SettingsManager.Warnings.Length = 1, "Malformed JSON warning was not recorded.")
        } finally {
            try FileDelete(SettingsManager.SettingsPath)
            try DirDelete(testDir)
            SettingsManager.SettingsDir := originalDir
            SettingsManager.SettingsPath := originalPath
        }

        startupCommand := StartupManager.Command()
        this.Assert(InStr(startupCommand, "--background") > 0, "Startup command is not background-safe.")
        this.Assert(InStr(startupCommand, A_AhkPath) > 0, "Source startup command omits AutoHotkey.")

        hotkeyCallback := (*) => 0
        hotkeyReleaseCallback := (*) => 0
        hotkeyResult := HotkeyManager.Register("^!F24", hotkeyCallback,
            hotkeyReleaseCallback)
        this.Assert(hotkeyResult.Ok, "Valid Focus Key registration failed.")
        this.Assert(HotkeyManager.RegisteredReleaseKey = "^!F24 up",
            "Focus Key release registration failed.")
        HotkeyManager.Unregister()
        this.Assert(!HotkeyManager.RegisteredKey && !HotkeyManager.RegisteredReleaseKey,
            "Focus Key press/release unregistration was incomplete.")
        invalidHotkey := HotkeyManager.Register("DefinitelyNotAKey", hotkeyCallback)
        this.Assert(!invalidHotkey.Ok, "Invalid Focus Key was accepted.")

        originalValueName := StartupManager.ValueName
        StartupManager.ValueName := "OlioLauncher-M1-Test-" DllCall("GetCurrentProcessId", "uint")
        try {
            startupEnabled := StartupManager.Apply(true)
            this.Assert(startupEnabled.Ok, "Per-user startup registration failed.")
            this.Assert(RegRead(StartupManager.RegistryPath, StartupManager.ValueName) = StartupManager.Command(),
                "Per-user startup command did not round trip.")
            startupDisabled := StartupManager.Apply(false)
            this.Assert(startupDisabled.Ok, "Per-user startup removal failed.")
            removed := false
            try RegRead(StartupManager.RegistryPath, StartupManager.ValueName)
            catch
                removed := true
            this.Assert(removed, "Per-user startup value was not removed.")
        } finally {
            try RegDelete(StartupManager.RegistryPath, StartupManager.ValueName)
            StartupManager.ValueName := originalValueName
        }

        settings := SettingsManager.Defaults()
        window := LauncherWindow(settings, (*) => 0)
        this.Assert(!window.IsVisible(), "Launcher must be hidden before Show.")
        this.Assert(window.Wordmark.Text = "Olio Launcher", "Launcher header title is incorrect.")
        this.Assert(FileExist(LauncherWindow.BrandIconPath()), "Launcher brand icon is missing.")
        this.Assert(window.AutoCloseOnDeactivate, "Launcher must close when another window is activated.")
        this.Assert(window.Buttons["calendar"].Enabled = true, "Calendar must be enabled.")
        this.Assert(window.Buttons["networkAnalyzer"].Enabled = false, "Network Analyzer must be disabled.")
        this.Assert(window.Buttons["clipboard"].Enabled = true, "Foundation navigation must be enabled.")
        this.Assert(window.DesiredLogicalHeight = 286, "Compact panel height changed unexpectedly.")
        this.Assert(LauncherWindow.CenteredY(0, 1080, 286) = 397,
            "Panel is not vertically centered in its work area.")
        accents := Map()
        for key in ["clipboard", "screenshot", "quickPastes", "calendar", "networkAnalyzer"]
            accents[TileRenderer.Tiles[window.Buttons[key].Hwnd].Accent] := true
        this.Assert(accents.Count = 5, "Tool accents must remain visually distinct.")
        settingsRect := Buffer(16, 0), clipboardRect := Buffer(16, 0)
        DllCall("GetWindowRect", "ptr", window.Buttons["settings"].Hwnd, "ptr", settingsRect)
        DllCall("GetWindowRect", "ptr", window.Buttons["clipboard"].Hwnd, "ptr", clipboardRect)
        settingsWidth := NumGet(settingsRect, 8, "int") - NumGet(settingsRect, 0, "int")
        clipboardWidth := NumGet(clipboardRect, 8, "int") - NumGet(clipboardRect, 0, "int")
        this.Assert(settingsWidth < clipboardWidth, "Settings must remain a compact utility pill.")
        settingsTile := TileRenderer.Tiles[window.Buttons["settings"].Hwnd]
        this.Assert(settingsTile.IconKind = "settings-2", "Settings must use Lucide settings-2 geometry.")
        this.Assert(settingsTile.Title = "Settings", "Settings pill must retain its visible label.")
        this.Assert(settingsTile.DrawLabel && !window.SettingsLabel.Visible,
            "Settings is not rendered as one seamless owner-drawn control.")
        settingsStyle := DllCall("User32\GetWindowLongW", "ptr",
            window.Buttons["settings"].Hwnd, "int", -16, "uint")
        this.Assert(settingsStyle & 0x04000000,
            "Settings button must clip the overlay label sibling during redraw.")
        this.Assert(TileRenderer.Tiles[window.BackButton.Hwnd].DrawLabel
            && !window.BackLabel.Visible,
            "Back is not rendered as one seamless owner-drawn control.")
        backStyle := DllCall("User32\GetWindowLongW", "ptr",
            window.BackButton.Hwnd, "int", -16, "uint")
        this.Assert(backStyle & 0x04000000,
            "Back button must clip the overlay label sibling during redraw.")
        this.Assert(LauncherWindow.ShouldRestoreFocus(window.Buttons["clipboard"].Hwnd, window.Gui.Hwnd),
            "Launcher-owned focus was not recognized.")
        this.Assert(!LauncherWindow.ShouldRestoreFocus(0, window.Gui.Hwnd),
            "Unrelated foreground focus must not trigger restoration.")
        this.Assert(window.Navigation.FindDirectional(window.Buttons["clipboard"], 0, 1).Hwnd
            = window.Buttons["quickPastes"].Hwnd,
            "Down from Clipboard must move to Quick Pastes.")
        this.Assert(window.Navigation.FindDirectional(window.Buttons["screenshot"], 0, 1).Hwnd
            = window.Buttons["quickPastes"].Hwnd,
            "Down from Screenshot must move to Quick Pastes.")
        this.Assert(window.Navigation.FindDirectional(window.Buttons["clipboard"], 1, 0).Hwnd
            = window.Buttons["screenshot"].Hwnd,
            "Right from Clipboard must move to Screenshot.")
        this.Assert(window.Navigation.FindDirectional(window.Buttons["screenshot"], 0, -1).Hwnd
            = window.Buttons["settings"].Hwnd,
            "Up from Screenshot must move to Settings.")
        buttonStyle := DllCall("User32\GetWindowLongW", "ptr", window.Buttons["clipboard"].Hwnd, "int", -16, "uint")
        this.Assert((buttonStyle & 0xF) = 0xB,
            "Tool tile is not using BS_OWNERDRAW; style=" Format("0x{:X}", buttonStyle) ".")
        window.Gui.Show("NA x-10000 y-10000 w360 h600")
        DllCall("UpdateWindow", "ptr", window.Gui.Hwnd)
        Sleep(100)
        this.Assert(TileRenderer.LastDrawError = "", "Tile draw failed: " TileRenderer.LastDrawError)
        window.OnCommand(0, window.Buttons["quickPastes"].Hwnd, 0, window.Gui.Hwnd)
        this.Assert(window.CurrentView = "quickPastes", "Native tile WM_COMMAND did not activate its view.")
        this.Assert(window.PageKey = "quickPastes", "Quick Pastes tile did not open its page.")
        this.Assert(window.PageTitle.Text = "Quick Pastes", "Quick Pastes page title is incorrect.")
        this.Assert(window.BackButton.Visible && !window.BackLabel.Visible,
            "The owner-drawn Back control is not visible on a tool page.")
        this.Assert(!window.Buttons["clipboard"].Visible, "Home tiles remained visible on a tool page.")
        window.OnCommand(0, window.BackButton.Hwnd, 0, window.Gui.Hwnd)
        this.Assert(window.PageKey = "" && window.Buttons["clipboard"].Visible,
            "Back did not restore the launcher home page.")
        window.Gui.Destroy()

        historyManager := ClipboardManager(settings)
        Loop 10
            historyManager.CaptureText("Milestone 1 regression entry " A_Index, "Regression.exe")
        clipboardWindow := LauncherWindow(settings, (*) => 0, false, historyManager)
        clipboardWindow.AutoCloseOnDeactivate := false
        clipboardWindow.Gui.Show("NA x-10000 y-10000 w360 h500")
        clipboardWindow.ShowPage("clipboard")
        this.Assert(clipboardWindow.PageKey = "clipboard", "Clipboard page did not open.")
        clientRect := Buffer(16, 0)
        DllCall("GetClientRect", "ptr", clipboardWindow.Gui.Hwnd, "ptr", clientRect)
        clientHeight := NumGet(clientRect, 12, "int") - NumGet(clientRect, 4, "int")
        windowDpi := DllCall("GetDpiForWindow", "ptr", clipboardWindow.Gui.Hwnd, "uint")
        maximumCompactHeight := Ceil(500 * (windowDpi ? windowDpi : 96) / 96)
        this.Assert(clientHeight <= maximumCompactHeight,
            "Clipboard page exceeded its compact DPI-scaled height.")
        listCount := DllCall("SendMessageW", "ptr", clipboardWindow.ClipboardList.Hwnd,
            "uint", 0x018B, "uptr", 0, "ptr", 0, "ptr")
        this.Assert(listCount = 10,
            "Clipboard page did not render all ten in-memory entries.")
        listStyle := DllCall("GetWindowLongW", "ptr", clipboardWindow.ClipboardList.Hwnd,
            "int", -16, "uint")
        this.Assert(listStyle & 0x10,
            "Clipboard history is not using owner-drawn card rows.")
        this.Assert(!clipboardWindow.HasOwnProp("ClipboardPasteButton"),
            "The removed Clipboard Paste button still exists.")
        clipboardWindow.PageTitle.GetPos(&titleX, &titleY, &titleWidth, &titleHeight)
        clipboardWindow.ClipboardClearButton.GetPos(&clearX, &clearY, &clearWidth, &clearHeight)
        this.Assert(clearX > titleX && clearY = titleY,
            "Clear all is not positioned beside the Clipboard History title.")
        this.Assert(!clipboardWindow.HasOwnProp("ClipboardPauseButton"),
            "The removed Clipboard Pause button still exists.")
        this.Assert(!clipboardWindow.HasOwnProp("ClipboardCopyButton")
            && !clipboardWindow.HasOwnProp("ClipboardPinButton"),
            "Removed Clipboard Copy or Pin controls still exist.")
        clipboardWindow.ClipboardOpenButton.GetPos(&openX, &openY, &openWidth, &openHeight)
        clipboardWindow.ClipboardDeleteButton.GetPos(&deleteX, &deleteY,
            &deleteWidth, &deleteHeight)
        this.Assert(openX + openWidth < deleteX && openY = deleteY,
            "Clipboard Open is not immediately left of Delete.")
        this.Assert(!clipboardWindow.ClipboardOpenButton.Enabled,
            "Clipboard Open must be disabled for a selected text item.")
        this.Assert(clipboardWindow.ClipboardClearButton.Enabled,
            "Clipboard Clear all is not a keyboard-accessible native control.")
        this.Assert(listStyle & 0x00200000,
            "Clipboard history does not expose native vertical scrolling.")
        DllCall("SendMessageW", "ptr", clipboardWindow.ClipboardList.Hwnd,
            "uint", 0x0197, "uptr", 9, "ptr", 0) ; LB_SETTOPINDEX
        topIndex := DllCall("SendMessageW", "ptr", clipboardWindow.ClipboardList.Hwnd,
            "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") ; LB_GETTOPINDEX
        this.Assert(topIndex >= 7,
            "Clipboard list could not scroll far enough to reach the tenth item.")
        clipboardWindow.ActivateClipboardSelection(10)
        this.Assert(clipboardWindow.IsVisible(),
            "Selecting a Clipboard entry unexpectedly closed the launcher.")
        this.Assert(clipboardWindow.Buttons["calendar"].Enabled
            && !clipboardWindow.Buttons["networkAnalyzer"].Enabled,
            "Calendar or deferred Network tile state changed on the Clipboard page.")

        previewDib := Buffer(56, 0)
        NumPut("uint", 40, previewDib, 0)
        NumPut("int", 2, previewDib, 4)
        NumPut("int", 2, previewDib, 8)
        NumPut("ushort", 1, previewDib, 12)
        NumPut("ushort", 32, previewDib, 14)
        NumPut("uint", 16, previewDib, 20)
        loop 4
            NumPut("uint", 0x004080FF, previewDib, 40 + (A_Index - 1) * 4)
        historyManager.CaptureDib(previewDib)
        clipboardWindow.RefreshClipboardHistory()
        this.Assert(clipboardWindow.ClipboardOpenButton.Enabled,
            "Clipboard Open was not enabled for a selected image item.")
        this.Assert(clipboardWindow.OpenClipboardPreview(),
            "The selected image preview did not open.")
        previewCanvasHwnd := clipboardWindow.PreviewWindow.Canvas.Hwnd
        this.Assert(clipboardWindow.PreviewWindow.IsVisible()
            && ClipboardPreviewWindow.Canvases.Has(previewCanvasHwnd),
            "The image preview window or paint registration is missing.")
        clipboardWindow.CloseClipboardPreview(false)
        this.Assert(!IsObject(clipboardWindow.PreviewWindow)
            && !ClipboardPreviewWindow.Canvases.Has(previewCanvasHwnd),
            "Closing image preview retained its window or canvas registration.")
        DllCall("SendMessageW", "ptr", clipboardWindow.ClipboardList.Hwnd,
            "uint", 0x0186, "uptr", 1, "ptr", 0)
        clipboardWindow.UpdateClipboardOpenState()
        this.Assert(!clipboardWindow.ClipboardOpenButton.Enabled,
            "Clipboard Open did not return to disabled for a text item.")
        clipboardWindow.ShowHome()
        this.Assert(clipboardWindow.DesiredLogicalHeight = 286,
            "Clipboard page changed the compact home-shell height.")
        clipboardWindow.Gui.Destroy()
        historyManager.Shutdown()

        settings["lastSelected"] := "settings"
        settingsWindow := LauncherWindow(settings, (*) => 0)
        this.Assert(settingsWindow.CurrentView = "clipboard",
            "Settings must not receive initial launcher selection.")
        settingsWindow.Gui.Destroy()

        this.WriteResult("PASS", this.Passed " assertions")
        ExitApp(0)
    }

    static WriteResult(status, detail) {
        FileAppend("MILESTONE1_TEST`t" status "`t" detail "`n", "*", "UTF-8")
    }
}

try Milestone1Tests.Run()
catch as testError {
    detail := testError.Message " @ " testError.File ":" testError.Line
    Milestone1Tests.WriteResult("FAIL", SubStr(RegExReplace(detail, "[\r\n\t]", " "), 1, 200))
    ExitApp(1)
}
