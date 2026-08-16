#Requires AutoHotkey v2.0.26
#SingleInstance Off
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
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk
#Include ..\prototypes\NativeLauncherPocWindow.ahk

class PocClipboardEntry {
    __New(kind := "text") {
        this.Kind := kind
        this.DisplayTime := "Now"
        this.Pinned := false
    }

    SafePreview(*) => "Synthetic clipboard preview"
}

class PocClipboardManager {
    __New() {
        this.Entries := [PocClipboardEntry()]
        this.Paused := false
        this.Restored := 0
    }

    ReleasePreviews() {
    }

    RestoreAndPromote(index) {
        this.Restored := index
        return true
    }

    ApplySettings(settings) {
        this.Paused := settings["clipboardPaused"]
    }
}

class PocQuickItem {
    __New() {
        this.Id := "synthetic"
        this.Title := "Synthetic paste"
        this.Content := "Synthetic content"
        this.Category := "Testing"
        this.IsFavorite := true
    }

    SafeTitle(*) => this.Title
    SafeCategory(*) => this.Category
    SafeContent(*) => this.Content
}

class PocConnection {
    __New(settings) {
        this.Settings := settings
        this.Credential := "synthetic"
        this.State := "connected"
        this.Detail := "Connected"
        this.RequestId := ""
        this.PairingSecret := ""
        this.RequestBusy := false
    }
}

class PocQuickManager {
    __New(connection) {
        this.Connection := connection
        this.Items := [PocQuickItem()]
        this.State := "ready"
        this.Detail := "Ready"
        this.RefreshCount := 0
        this.RequestBusy := false
    }

    Refresh() => this.RefreshCount += 1
    Filter(*) => this.Items
    LastSyncDisplay() => "Just now"
}

class NativeLauncherPocTests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static Run() {
        settings := SettingsManager.Defaults()
        clipboard := PocClipboardManager()
        connection := PocConnection(settings)
        quick := PocQuickManager(connection)
        navigated := []
        applied := (action, changes) => {Ok: true, Values: settings}
        window := NativeLauncherPocWindow(settings,
            (key) => navigated.Push(key), true, clipboard, connection, quick, applied)

        this.Assert(window is LauncherWindow,
            "The POC no longer inherits production launcher behavior.")
        this.Assert(window.Gui.Title = "Olio Launcher - Native POC",
            "The POC window is not clearly identified.")
        this.Assert(window.LogicalWidth = 296 && window.CurrentLogicalHeight() = 260,
            "The Standard home does not match the reference flyout footprint.")
        this.Assert(window.PageKey = "" && !window.BackButton.Visible,
            "The POC no longer starts on the simple tool home.")

        for key in ["clipboard", "screenshot", "quickPastes"] {
            button := window.Buttons[key]
            this.Assert(button.Visible && button.Enabled,
                key " is not available on the home view.")
            this.Assert(PocCommandRenderer.Commands.Has(button.Hwnd)
                && !TileRenderer.Tiles.Has(button.Hwnd),
                key " is not using the redesigned command-row renderer.")
        }
        for key in ["sendToPhone", "networkAnalyzer"]
            this.Assert(!window.Buttons[key].Visible && !window.Buttons[key].Enabled,
                key " adds unfinished UI noise to the POC.")
        this.Assert(window.Buttons["settings"].Visible
            && PocCommandRenderer.Items[window.Buttons["settings"].Hwnd].Kind = "circle",
            "Settings is not the reference-style footer gear.")
        this.Assert(window.FooterRule.Visible && !window.Logo.Visible
            && window.Wordmark.Text = "OLIO",
            "The reference flyout header/footer structure is missing.")

        window.Buttons["clipboard"].GetPos(&rowX, &rowY, &rowWidth, &rowHeight)
        this.Assert(rowX = 10 && rowY = 35 && rowWidth = 276 && rowHeight = 51,
            "The reference quick-tile geometry is incorrect.")
        this.Assert(PocCommandRenderer.Commands[window.Buttons["screenshot"].Hwnd]
                .ShowChevron = false,
            "Screenshot gained navigation chrome instead of remaining an immediate action.")

        window.LayoutForLauncherScale("compact")
        this.Assert(window.LogicalWidth = 266 && window.CurrentLogicalHeight() = 234,
            "Compact home scaling is incorrect.")
        window.LayoutForLauncherScale("large")
        this.Assert(window.LogicalWidth = 340 && window.CurrentLogicalHeight() = 299,
            "Large home scaling is incorrect.")
        window.LayoutForLauncherScale("standard")

        window.OnCommand(0, window.Buttons["quickPastes"].Hwnd, 0, window.Gui.Hwnd)
        this.Assert(window.PageKey = "quickPastes" && window.BackButton.Visible
            && window.QuickPasteList.Visible,
            "Quick Pastes did not open through the inherited detail page.")
        window.QuickSearchEdit.GetPos(&searchX, &searchY, &searchWidth, &searchHeight)
        this.Assert(searchX = 10 && searchY = 40 && searchWidth = 276
            && searchHeight = 30 && window.CurrentLogicalHeight() = 260,
            "Quick Pastes does not match the compact reference subpanel.")
        this.Assert(!window.Buttons["clipboard"].Visible,
            "The simple home remained visible behind a detail page.")
        window.OnCommand(0, window.BackButton.Hwnd, 0, window.Gui.Hwnd)
        this.Assert(window.PageKey = "" && window.Buttons["clipboard"].Visible,
            "Back did not return to the simple home.")
        this.Assert(!window.Buttons["sendToPhone"].Visible
            && !window.Buttons["networkAnalyzer"].Visible,
            "Deferred tools reappeared after Back.")

        window.OnCommand(0, window.Buttons["clipboard"].Hwnd, 0, window.Gui.Hwnd)
        this.Assert(window.PageKey = "clipboard" && window.ClipboardList.Visible,
            "Clipboard did not open through the inherited detail page.")
        this.Assert(window.PageTitle.Text = "Clipboard · 1 item"
            && window.ClipboardDeleteButton.Visible,
            "Clipboard did not adopt the compact reference header and inline actions.")
        window.OnCommand(0, window.BackButton.Hwnd, 0, window.Gui.Hwnd)
        window.OnCommand(0, window.Buttons["screenshot"].Hwnd, 0, window.Gui.Hwnd)
        this.Assert(navigated[navigated.Length] = "screenshot" && window.PageKey = "",
            "Screenshot did not remain an immediate action from home.")

        settings["theme"] := "light"
        window.ApplyTheme()
        this.Assert(ThemeManager.Mode = "light",
            "The POC did not apply the shared light palette.")
        settings["theme"] := "dark"
        window.ApplyTheme()
        this.Assert(ThemeManager.Mode = "dark",
            "The POC did not apply the shared dark palette.")

        window.Gui.Show("NA x-10000 y-10000 w296 h260")
        window.OnCommand(0, window.Buttons["clipboard"].Hwnd, 0, window.Gui.Hwnd)
        window.HandleEscape()
        this.Assert(window.IsVisible() && window.PageKey = "",
            "Escape on a detail page did not return home.")
        window.HandleEscape()
        this.Assert(!window.IsVisible(), "Escape on home did not hide the POC.")

        window.OpenPreferences()
        this.Assert(IsObject(window.SettingsDialog) && window.SettingsDialog.IsVisible(),
            "The POC Settings utility did not open the production Settings window.")
        window.CloseSettingsDialog()

        runner := FileRead(A_ScriptDir "\..\prototypes\Run-NativeLauncherPoc.cmd")
        this.Assert(InStr(runner, "OLIO_PRODUCTION_SCRIPT")
            && InStr(runner, "Stop-Process") && InStr(runner, "OLIO_POC_SCRIPT"),
            "The POC runner does not replace the exact production/POC processes.")
        appSource := FileRead(A_ScriptDir "\..\prototypes\NativeLauncherPoc.ahk")
        this.Assert(InStr(appSource, "HotkeyManager.Register(this.Settings["
                Chr(34) "focusKey" Chr(34) "]"),
            "The POC does not take ownership of the configured Focus Key.")

        window.Gui.Destroy()
        this.WriteResult("PASS", this.Passed " assertions")
        ExitApp(0)
    }

    static WriteResult(status, detail) {
        FileAppend("NATIVE_LAUNCHER_POC_TEST`t" status "`t" detail "`n",
            "*", "UTF-8")
    }
}

try NativeLauncherPocTests.Run()
catch as testError {
    detail := testError.Message " @ " testError.File ":" testError.Line
    NativeLauncherPocTests.WriteResult("FAIL",
        SubStr(RegExReplace(detail, "[\r\n\t]", " "), 1, 240))
    ExitApp(1)
}
