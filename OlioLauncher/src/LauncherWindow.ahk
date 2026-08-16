class LauncherWindow {
    __New(settings, navigateCallback, visualTestMode := false, clipboardManager := 0,
        connectionManager := 0, quickPastesManager := 0, settingsApplyCallback := 0,
        calendarManager := 0) {
        this.Settings := settings
        this.NavigateCallback := navigateCallback
        this.SettingsApplyCallback := settingsApplyCallback
        this.VisualTestMode := visualTestMode
        this.ClipboardManager := clipboardManager
        this.ConnectionManager := connectionManager
        this.QuickPastesManager := quickPastesManager
        this.CalendarManager := calendarManager
        this.CalendarVisibleItems := []
        this.QuickVisibleItems := []
        this.QuickLastFeedback := ""
        this.QuickWheelRemainder := 0
        this.PasteRunner := (hwnd) => WindowsInterop.PasteClipboardToWindow(hwnd)
        this.PreviousForeground := 0
        ; Settings is a utility, not the launcher's default destination.
        this.CurrentView := settings["lastSelected"] = "settings"
            ? "clipboard" : settings["lastSelected"]
        this.EnabledButtons := []
        this.Buttons := Map()
        this.ButtonKeysByHwnd := Map()
        this.HomeControls := []
        this.PageKey := ""
        this.LauncherScale := settings.Has("launcherScale")
            ? settings["launcherScale"] : "standard"
        this.ScaleFactor := LauncherWindow.ScaleFactorFor(this.LauncherScale)
        this.DesiredLogicalHeight := Round(286 * this.ScaleFactor)
        this.HasVisibleStatus := false
        this.AutoCloseOnDeactivate := settings["closeOnFocusLost"] && !visualTestMode
        this.PreviewWindow := 0
        this.PreviewPriorAutoClose := this.AutoCloseOnDeactivate
        this.LastPreviewError := ""
        this.DirectScreenshotActive := false
        this.DirectScreenshotPriorAutoClose := this.AutoCloseOnDeactivate
        this.SettingsDialog := 0
        this.LogicalWidth := SettingsManager.PanelWidthForScale(this.LauncherScale)
        ThemeManager.Configure(settings)

        options := "-Caption +Border"
        if !visualTestMode
            options .= " +ToolWindow"
        if settings["alwaysOnTop"]
            options .= " +AlwaysOnTop"
        this.Gui := Gui(options, "Olio Launcher")
        this.Gui.BackColor := ThemeManager.Hex("LauncherWindow")
        this.Gui.MarginX := 16
        this.Gui.MarginY := 14

        logoOptions := "x16 y10 w40 h40"
        if A_IsCompiled
            logoOptions .= " Icon1"
        this.Logo := this.Gui.AddPicture(logoOptions, LauncherWindow.BrandIconPath())

        ; The logo carries the Olio brand; the adjacent label names this app.
        this.Gui.SetFont("s10 bold cF8FAFC", "Segoe UI Variable Text")
        this.Wordmark := this.Gui.AddText("x58 y16 w150 h28 +0x200", "Olio Launcher")

        settingsButton := this.Gui.Add("Custom", "ClassButton x232 y14 w112 h36 0x5401000B", "Settings")
        this.Buttons["settings"] := settingsButton
        this.ButtonKeysByHwnd[settingsButton.Hwnd] := "settings"
        TileRenderer.RegisterSettingsButton(settingsButton, 0xA78BFA)
        this.HomeControls.Push(settingsButton)
        this.Gui.SetFont("s9 bold cF8FAFC", "Segoe UI Variable Text")
        this.SettingsLabel := this.Gui.AddText(
            "x272 y16 w62 h32 +0x200 +0x100 Background0B1220 Hidden", "Settings")
        this.SettingsLabel.OnEvent("Click", (*) => this.OpenPreferences())

        definitions := [
            {Key: "clipboard", Accessible: "Clipboard History", Title: "Clipboard", Subtitle: "", Accent: 0x38BDF8, X: 16, Y: 64, W: 160, H: 64, Enabled: true},
            {Key: "screenshot", Accessible: "Dynamic Screenshot", Title: "Screenshot", Subtitle: "", Accent: 0x8B5CF6, X: 184, Y: 64, W: 160, H: 64, Enabled: true},
            {Key: "quickPastes", Accessible: "Quick Pastes", Title: "Quick Pastes", Subtitle: "", Accent: 0x34D399, X: 16, Y: 136, W: 328, H: 64, Enabled: true},
            {Key: "calendar", Accessible: "Today's Google Calendar schedule", Title: "Calendar", Subtitle: "Today", Accent: 0xF59E0B, X: 16, Y: 208, W: 160, H: 56, Enabled: true},
            {Key: "networkAnalyzer", Accessible: "Network Analyzer — Coming later", Title: "Network", Subtitle: "Later", Accent: 0x64748B, X: 184, Y: 208, W: 160, H: 56, Enabled: false}
        ]

        for definition in definitions {
            button := this.Gui.Add("Custom", "ClassButton x" definition.X " y" definition.Y
                " w" definition.W " h" definition.H " 0x5001000B", definition.Accessible)
            this.Buttons[definition.Key] := button
            this.ButtonKeysByHwnd[button.Hwnd] := definition.Key
            TileRenderer.Register(button, definition.Title, definition.Subtitle,
                definition.Accent, definition.Enabled)
            this.HomeControls.Push(button)
            if definition.Enabled
                this.EnabledButtons.Push(button)
        }
        this.EnabledButtons.Push(settingsButton)

        this.PageDefinitions := Map(
            "clipboard", {Title: "Clipboard History", Subtitle: "History will appear here.", Accent: 0x38BDF8},
            "screenshot", {Title: "Dynamic Screenshot", Subtitle: "Drag to select an area.", Accent: 0x8B5CF6},
            "quickPastes", {Title: "Quick Pastes", Subtitle: "Launcher access begins in Milestone 6.", Accent: 0x34D399},
            "calendar", {Title: "Today's Schedule", Subtitle: "The rest of your day.", Accent: 0xF59E0B}
        )
        this.BackButton := this.Gui.Add("Custom",
            "ClassButton x232 y14 w112 h36 Hidden 0x5401000B", "Back to tools")
        this.ButtonKeysByHwnd[this.BackButton.Hwnd] := "__back"
        TileRenderer.RegisterUtilityButton(this.BackButton, "Back", "arrow-left",
            0x818CF8, true, true)
        this.Gui.SetFont("s9 bold cF8FAFC", "Segoe UI Variable Text")
        this.BackLabel := this.Gui.AddText(
            "x272 y16 w62 h32 +0x200 +0x100 Background0B1220 Hidden", "Back")
        this.BackLabel.OnEvent("Click", (*) => this.ShowHome())

        this.Gui.SetFont("s16 bold cF8FAFC", "Segoe UI Variable Text")
        this.PageTitle := this.Gui.AddText("x16 y62 w328 h34 +0x200 Hidden", "")
        this.Gui.SetFont("s10 c94A3B8", "Segoe UI Variable Text")
        this.PageSubtitle := this.Gui.AddText("x16 y124 w328 h60 +Wrap Hidden", "")
        this.PageControls := [this.BackButton, this.PageTitle, this.PageSubtitle]
        this.CreateClipboardControls()
        this.CreateConnectionControls()
        this.CreateQuickPastesControls()
        this.CreateCalendarControls()

        this.Gui.SetFont("s8 cFCA5A5", "Segoe UI Variable Text")
        this.StatusText := this.Gui.AddText("x16 y278 w328 h28 +Wrap Hidden", "")

        this.Gui.OnEvent("Close", (*) => this.Hide(true))
        this.Gui.OnEvent("Escape", (*) => this.HandleEscape())
        this.Navigation := Navigation(this.Gui, this.EnabledButtons, (*) => this.HandleEscape())
        this.NavigationContext := (*) => this.IsNavigationContext()
        this.LeftHandler := (*) => this.Navigation.MoveDirectional(-1, 0)
        this.RightHandler := (*) => this.Navigation.MoveDirectional(1, 0)
        this.UpHandler := (*) => this.Navigation.MoveDirectional(0, -1)
        this.DownHandler := (*) => this.Navigation.MoveDirectional(0, 1)
        this.EnterHandler := (*) => this.Navigation.ActivateFocused()
        HotIf(this.NavigationContext)
        Hotkey("Left", this.LeftHandler)
        Hotkey("Right", this.RightHandler)
        Hotkey("Up", this.UpHandler)
        Hotkey("Down", this.DownHandler)
        Hotkey("Enter", this.EnterHandler)
        HotIf()
        this.ClipboardEnterContext := (*) => WinActive("ahk_id " this.Gui.Hwnd)
            && this.PageKey = "clipboard"
        this.ClipboardEnterHandler := (*) => this.ActivateClipboardFocused()
        HotIf(this.ClipboardEnterContext)
        Hotkey("Enter", this.ClipboardEnterHandler)
        HotIf()
        this.ClipboardSpaceContext := (*) => WinActive("ahk_id " this.Gui.Hwnd)
            && this.PageKey = "clipboard"
            && DllCall("GetFocus", "ptr") = this.ClipboardList.Hwnd
        this.ClipboardSpaceHandler := (*) => this.ActivateClipboardSelection()
        HotIf(this.ClipboardSpaceContext)
        Hotkey("Space", this.ClipboardSpaceHandler)
        HotIf()
        this.QuickEnterContext := (*) => WinActive("ahk_id " this.Gui.Hwnd)
            && this.PageKey = "quickPastes"
        this.QuickEnterHandler := (*) => this.ActivateQuickPasteFocused()
        HotIf(this.QuickEnterContext)
        Hotkey("Enter", this.QuickEnterHandler)
        HotIf()
        this.QuickSpaceContext := (*) => WinActive("ahk_id " this.Gui.Hwnd)
            && this.PageKey = "quickPastes"
            && DllCall("GetFocus", "ptr") = this.QuickPasteList.Hwnd
        this.QuickSpaceHandler := (*) => this.ChooseQuickPasteSelection()
        HotIf(this.QuickSpaceContext)
        Hotkey("Space", this.QuickSpaceHandler)
        HotIf()
        this.Activate(this.CurrentView, false)

        this.ActivateHandler := ObjBindMethod(this, "OnWindowActivate")
        this.ActivateAppHandler := ObjBindMethod(this, "OnApplicationActivate")
        this.DpiHandler := ObjBindMethod(this, "OnDpiChanged")
        this.CommandHandler := ObjBindMethod(this, "OnCommand")
        this.ListMouseHandler := ObjBindMethod(this, "OnListMouseUp")
        this.QuickWheelHandler := ObjBindMethod(this, "OnQuickPasteMouseWheel")
        this.HeaderMouseHandler := ObjBindMethod(this, "OnHeaderMouseDown")
        this.ExitSizeMoveHandler := ObjBindMethod(this, "OnExitSizeMove")
        OnMessage(0x0006, this.ActivateHandler)
        OnMessage(0x001C, this.ActivateAppHandler)
        OnMessage(0x02E0, this.DpiHandler)
        OnMessage(0x0111, this.CommandHandler)
        OnMessage(0x0202, this.ListMouseHandler) ; WM_LBUTTONUP
        OnMessage(0x020A, this.QuickWheelHandler) ; WM_MOUSEWHEEL
        OnMessage(0x0201, this.HeaderMouseHandler) ; WM_LBUTTONDOWN
        OnMessage(0x0232, this.ExitSizeMoveHandler) ; WM_EXITSIZEMOVE
        this.LayoutForLauncherScale(this.LauncherScale)
        this.ApplyTheme()
    }

    CreateClipboardControls() {
        this.ClipboardControls := []
        this.Gui.SetFont("s9 c94A3B8", "Segoe UI Variable Text")
        this.ClipboardStatus := this.Gui.AddText(
            "x16 y102 w328 h28 +0x200 Hidden", "History is empty")
        this.ClipboardControls.Push(this.ClipboardStatus)

        this.ClipboardClearButton := this.AddClipboardButton(
            "x238 y62 w106 h34 Hidden", "Clear all", 0xF87171)
        this.ButtonKeysByHwnd[this.ClipboardClearButton.Hwnd] := "__clip_clear"
        this.Gui.SetFont("s9 cE2E8F0", "Segoe UI Variable Text")
        this.ClipboardList := this.Gui.Add("Custom",
            "ClassListBox x16 y130 w328 h290 Hidden Background020617 cE2E8F0 0x50211051")
        ClipboardRenderer.Register(this.ClipboardList, this.ClipboardManager)
        this.ClipboardControls.Push(this.ClipboardList)

        this.ClipboardOpenButton := this.AddClipboardButton(
            "x128 y438 w104 h42 Hidden", "Open", 0x38BDF8)
        this.ButtonKeysByHwnd[this.ClipboardOpenButton.Hwnd] := "__clip_open"
        TileRenderer.SetEnabled(this.ClipboardOpenButton, false)

        this.ClipboardDeleteButton := this.AddClipboardButton(
            "x240 y438 w104 h42 Hidden", "Delete", 0xFB7185)
        this.ButtonKeysByHwnd[this.ClipboardDeleteButton.Hwnd] := "__clip_delete"

        this.ClipboardActionControls := [this.BackButton, this.ClipboardClearButton,
            this.ClipboardList, this.ClipboardOpenButton, this.ClipboardDeleteButton]
    }

    AddClipboardButton(options, title, accent) {
        button := this.Gui.Add("Custom", "ClassButton " options " 0x5001000B", title)
        TileRenderer.Register(button, title, "", accent, true)
        this.ClipboardControls.Push(button)
        return button
    }

    CreateConnectionControls() {
        this.ConnectionControls := []
        this.PreferencesButton := this.AddConnectionButton(
            "x16 y104 w328 h38 Hidden", "Launcher preferences", 0x818CF8)
        this.ButtonKeysByHwnd[this.PreferencesButton.Hwnd] := "__preferences"
        this.Gui.SetFont("s9 cCBD5E1", "Segoe UI Variable Text")
        this.ConnectionNameLabel := this.Gui.AddText("x16 y154 w328 h22 Hidden",
            "Launcher device name")
        this.ConnectionControls.Push(this.ConnectionNameLabel)
        this.Gui.SetFont("s9 cF8FAFC", "Segoe UI Variable Text")
        this.ConnectionNameEdit := this.Gui.AddEdit(
            "x16 y176 w328 h30 Hidden Background0F172A cF8FAFC",
            this.Settings.Has("deviceName") ? this.Settings["deviceName"] : SubStr(A_ComputerName " Launcher", 1, 80))
        this.ConnectionControls.Push(this.ConnectionNameEdit)
        this.Gui.SetFont("s9 cCBD5E1", "Segoe UI Variable Text")
        this.ConnectionStatus := this.Gui.AddText(
            "x16 y216 w328 h80 +Wrap Hidden", "Disconnected")
        this.ConnectionControls.Push(this.ConnectionStatus)

        this.ConnectionConnectButton := this.AddConnectionButton(
            "x16 y308 w328 h42 Hidden", "Connect Olio Account", 0x22D3EE)
        this.ButtonKeysByHwnd[this.ConnectionConnectButton.Hwnd] := "__connection_connect"
        this.ConnectionCancelButton := this.AddConnectionButton(
            "x16 y308 w328 h42 Hidden", "Cancel authentication", 0xF59E0B)
        this.ButtonKeysByHwnd[this.ConnectionCancelButton.Hwnd] := "__connection_cancel"
        this.ConnectionRetryButton := this.AddConnectionButton(
            "x16 y308 w160 h42 Hidden", "Retry status", 0x22D3EE)
        this.ButtonKeysByHwnd[this.ConnectionRetryButton.Hwnd] := "__connection_retry"
        this.ConnectionDisconnectButton := this.AddConnectionButton(
            "x16 y308 w328 h42 Hidden", "Disconnect Olio Account", 0xF87171)
        this.ButtonKeysByHwnd[this.ConnectionDisconnectButton.Hwnd] := "__connection_disconnect"
    }

    AddConnectionButton(options, title, accent) {
        button := this.Gui.Add("Custom", "ClassButton " options " 0x5001000B", title)
        TileRenderer.Register(button, title, "", accent, true)
        this.ConnectionControls.Push(button)
        return button
    }

    CreateQuickPastesControls() {
        this.QuickPastesControls := []
        this.Gui.SetFont("s9 c94A3B8", "Segoe UI Variable Text")
        this.QuickStatus := this.Gui.AddText(
            "x16 y102 w328 h28 +0x200 Hidden", "Connect an Olio account in Settings.")
        this.QuickPastesControls.Push(this.QuickStatus)

        this.QuickRefreshButton := this.AddQuickPasteButton(
            "x238 y62 w106 h34 Hidden", "Refresh", 0x34D399)
        this.ButtonKeysByHwnd[this.QuickRefreshButton.Hwnd] := "__quick_refresh"

        this.Gui.SetFont("s8 c94A3B8", "Segoe UI Variable Text")
        this.QuickSearchLabel := this.Gui.AddText(
            "x16 y132 w328 h16 Hidden", "Search")
        this.QuickPastesControls.Push(this.QuickSearchLabel)
        this.Gui.SetFont("s9 cF8FAFC", "Segoe UI Variable Text")
        this.QuickSearchEdit := this.Gui.AddEdit(
            "x16 y148 w328 h30 Hidden Background0F172A cF8FAFC",
            "")
        this.QuickSearchEdit.OnEvent("Change", (*) => this.RefreshQuickPasteList())
        this.QuickPastesControls.Push(this.QuickSearchEdit)

        this.QuickPasteList := this.Gui.Add("Custom",
            "ClassListBox x16 y184 w328 h230 Hidden Background020617 cE2E8F0 0x50211051")
        QuickPastesRenderer.Register(this.QuickPasteList, this)
        this.QuickPastesControls.Push(this.QuickPasteList)

        this.Gui.SetFont("s8 c94A3B8", "Segoe UI Variable Text")
        this.QuickFooter := this.Gui.AddText(
            "x16 y416 w328 h18 +0x200 Hidden", "Waiting for first sync")
        this.QuickPastesControls.Push(this.QuickFooter)

        this.QuickCopyButton := this.AddQuickPasteButton(
            "x128 y438 w104 h42 Hidden", "Copy", 0x38BDF8)
        this.ButtonKeysByHwnd[this.QuickCopyButton.Hwnd] := "__quick_copy"
        this.QuickPasteButton := this.AddQuickPasteButton(
            "x240 y438 w104 h42 Hidden", "Paste", 0x34D399)
        this.ButtonKeysByHwnd[this.QuickPasteButton.Hwnd] := "__quick_paste"
        this.QuickSettingsButton := this.AddQuickPasteButton(
            "x16 y438 w328 h42 Hidden", "Open Settings", 0xFBBF24)
        this.ButtonKeysByHwnd[this.QuickSettingsButton.Hwnd] := "__quick_settings"

    }

    AddQuickPasteButton(options, title, accent) {
        button := this.Gui.Add("Custom", "ClassButton " options " 0x5001000B", title)
        TileRenderer.Register(button, title, "", accent, true)
        this.QuickPastesControls.Push(button)
        return button
    }

    CreateCalendarControls() {
        this.CalendarControls := []
        this.Gui.SetFont("s9 c94A3B8", "Segoe UI Variable Text")
        this.CalendarStatus := this.Gui.AddText(
            "x16 y102 w328 h28 +0x200 Hidden", "Ready to load today's schedule.")
        this.CalendarControls.Push(this.CalendarStatus)

        this.CalendarRefreshButton := this.AddCalendarButton(
            "x238 y62 w106 h34 Hidden", "Refresh", 0xF59E0B)
        this.ButtonKeysByHwnd[this.CalendarRefreshButton.Hwnd] := "__calendar_refresh"

        this.Gui.SetFont("s9 cE2E8F0", "Segoe UI Variable Text")
        this.CalendarList := this.Gui.Add("Custom",
            "ClassListBox x16 y136 w328 h278 Hidden Background020617 cE2E8F0 0x50211051")
        CalendarRenderer.Register(this.CalendarList, this)
        this.CalendarControls.Push(this.CalendarList)

        this.Gui.SetFont("s8 c94A3B8", "Segoe UI Variable Text")
        this.CalendarFooter := this.Gui.AddText(
            "x16 y416 w328 h18 +0x200 Hidden", "Not updated yet")
        this.CalendarControls.Push(this.CalendarFooter)

        this.CalendarConnectButton := this.AddCalendarButton(
            "x16 y438 w328 h42 Hidden", "Open Calendar Settings", 0x38BDF8)
        this.ButtonKeysByHwnd[this.CalendarConnectButton.Hwnd] := "__calendar_settings"
    }

    AddCalendarButton(options, title, accent) {
        button := this.Gui.Add("Custom", "ClassButton " options " 0x5001000B", title)
        TileRenderer.Register(button, title, "", accent, true)
        this.CalendarControls.Push(button)
        return button
    }

    ApplyWorkstationWindowStyle() {
        try {
            cornerPreference := 2 ; DWMWCP_ROUND
            DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd, "uint", 33,
                "int*", &cornerPreference, "uint", 4)
            borderColor := TileRenderer.ColorRef(
                ThemeManager.Color("LauncherBorder", 0x263750))
            DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd, "uint", 34,
                "uint*", &borderColor, "uint", 4)
        }
    }

    static ScaleFactorFor(scale) {
        return scale = "compact" ? 0.90 : scale = "large" ? 1.15 : 1.0
    }

    LayoutForLauncherScale(scale) {
        this.LauncherScale := scale
        this.ScaleFactor := LauncherWindow.ScaleFactorFor(scale)
        metric(value) => Round(value * this.ScaleFactor)
        logicalWidth := SettingsManager.PanelWidthForScale(scale)
        this.LogicalWidth := logicalWidth
        this.DesiredLogicalHeight := metric(286)
        inner := metric(328)
        columnWidth := metric(160)
        rightColumn := metric(184)
        utilityX := logicalWidth - metric(128)
        this.Logo.Move(metric(16), metric(10), metric(40), metric(40))
        this.Wordmark.Move(metric(58), metric(16), Max(metric(60),
            utilityX - metric(66)), metric(28))
        this.Buttons["settings"].Move(utilityX, metric(14), metric(112), metric(36))
        this.SettingsLabel.Move(utilityX + metric(40), metric(16), metric(62), metric(32))
        this.Buttons["clipboard"].Move(metric(16), metric(64), columnWidth, metric(64))
        this.Buttons["screenshot"].Move(rightColumn, metric(64), columnWidth, metric(64))
        this.Buttons["quickPastes"].Move(metric(16), metric(136), inner, metric(64))
        this.Buttons["calendar"].Move(metric(16), metric(208), columnWidth, metric(56))
        this.Buttons["networkAnalyzer"].Move(rightColumn, metric(208), columnWidth, metric(56))
        this.BackButton.Move(utilityX, metric(14), metric(112), metric(36))
        this.BackLabel.Move(utilityX + metric(40), metric(16), metric(62), metric(32))
        this.PageTitle.Move(metric(16), metric(62), inner, metric(34))
        this.PageSubtitle.Move(metric(16), metric(124), inner, metric(60))
        this.StatusText.Move(metric(16), metric(278), inner, metric(28))

        this.ClipboardStatus.Move(metric(16), metric(102), inner, metric(28))
        this.ClipboardClearButton.Move(logicalWidth - metric(122), metric(62), metric(106), metric(34))
        this.ClipboardList.Move(metric(16), metric(130), inner, metric(290))
        this.ClipboardOpenButton.Move(logicalWidth - metric(232), metric(438), metric(104), metric(42))
        this.ClipboardDeleteButton.Move(logicalWidth - metric(120), metric(438), metric(104), metric(42))

        this.PreferencesButton.Move(metric(16), metric(104), inner, metric(38))
        this.ConnectionNameLabel.Move(metric(16), metric(154), inner, metric(22))
        this.ConnectionNameEdit.Move(metric(16), metric(176), inner, metric(30))
        this.ConnectionStatus.Move(metric(16), metric(216), inner, metric(80))
        for button in [this.ConnectionConnectButton, this.ConnectionCancelButton,
            this.ConnectionDisconnectButton]
            button.Move(metric(16), metric(308), inner, metric(42))
        this.ConnectionRetryButton.Move(metric(16), metric(308),
            Floor((inner - metric(8)) / 2), metric(42))

        this.QuickStatus.Move(metric(16), metric(102), inner, metric(28))
        this.QuickRefreshButton.Move(logicalWidth - metric(122), metric(62), metric(106), metric(34))
        this.QuickSearchLabel.Move(metric(16), metric(132), inner, metric(16))
        this.QuickSearchEdit.Move(metric(16), metric(148), inner, metric(30))
        this.QuickPasteList.Move(metric(16), metric(184), inner, metric(230))
        this.QuickFooter.Move(metric(16), metric(416), inner, metric(18))
        this.QuickCopyButton.Move(logicalWidth - metric(232), metric(438), metric(104), metric(42))
        this.QuickPasteButton.Move(logicalWidth - metric(120), metric(438), metric(104), metric(42))
        this.QuickSettingsButton.Move(metric(16), metric(438), inner, metric(42))

        this.CalendarStatus.Move(metric(16), metric(102), inner, metric(28))
        this.CalendarRefreshButton.Move(logicalWidth - metric(122), metric(62), metric(106), metric(34))
        this.CalendarList.Move(metric(16), metric(136), inner, metric(278))
        this.CalendarFooter.Move(metric(16), metric(416), inner, metric(18))
        this.CalendarConnectButton.Move(metric(16), metric(438), inner, metric(42))
    }

    ApplyTheme() {
        ThemeManager.Configure(this.Settings)
        this.Gui.BackColor := ThemeManager.Hex("LauncherWindow")
        this.ApplyWorkstationWindowStyle()
        for control in [this.Wordmark, this.SettingsLabel, this.BackLabel,
            this.PageTitle]
            control.SetFont("c" ThemeManager.Hex("Text"),
                "Segoe UI Variable Text")
        for control in [this.PageSubtitle, this.ClipboardStatus,
            this.ConnectionNameLabel, this.ConnectionStatus, this.QuickStatus,
            this.QuickSearchLabel, this.QuickFooter, this.CalendarStatus,
            this.CalendarFooter]
            control.SetFont("c" ThemeManager.Hex("MutedText"),
                "Segoe UI Variable Text")
        this.StatusText.SetFont("c" ThemeManager.Hex("ErrorText"),
            "Segoe UI Variable Text")
        for control in [this.ConnectionNameEdit, this.QuickSearchEdit] {
            try control.Opt("Background" ThemeManager.Hex("LauncherInput")
                " c" ThemeManager.Hex("Text"))
        }
        for control in [this.SettingsLabel, this.BackLabel] {
            try control.Opt("Background" ThemeManager.Hex("LauncherSurface")
                " c" ThemeManager.Hex("Text"))
        }
        for control in [this.ClipboardList, this.QuickPasteList, this.CalendarList] {
            try control.Opt("Background" ThemeManager.Hex("LauncherWindow")
                " c" ThemeManager.Hex("Text"))
        }
        TileRenderer.RefreshAll()
        try DllCall("InvalidateRect", "ptr", this.ClipboardList.Hwnd,
            "ptr", 0, "int", true)
        try DllCall("InvalidateRect", "ptr", this.QuickPasteList.Hwnd,
            "ptr", 0, "int", true)
        try DllCall("InvalidateRect", "ptr", this.CalendarList.Hwnd,
            "ptr", 0, "int", true)
    }

    OnHeaderMouseDown(wParam, lParam, msg, hwnd) {
        if !this.IsVisible() || (hwnd != this.Logo.Hwnd && hwnd != this.Wordmark.Hwnd)
            return
        DllCall("ReleaseCapture")
        DllCall("SendMessageW", "ptr", this.Gui.Hwnd, "uint", 0x00A1,
            "uptr", 2, "ptr", 0)
        return 0
    }

    OnExitSizeMove(wParam, lParam, msg, hwnd) {
        if hwnd != this.Gui.Hwnd || this.VisualTestMode
            return
        rect := Buffer(16, 0)
        if !DllCall("GetWindowRect", "ptr", hwnd, "ptr", rect)
            return
        monitor := DllCall("MonitorFromWindow", "ptr", hwnd, "uint", 2, "ptr")
        try area := WindowsInterop.MonitorArea(monitor)
        catch
            return
        changes := Map(
            "rememberedMonitor", area.Name,
            "rememberedX", NumGet(rect, 0, "int"),
            "rememberedY", NumGet(rect, 4, "int"),
            "rememberedPositionValid", true
        )
        try {
            SettingsManager.UpdateMany(changes)
            for key, value in changes
                this.Settings[key] := value
        }
        return 0
    }

    IsVisible() {
        try return DllCall("IsWindowVisible", "ptr", this.Gui.Hwnd)
        catch
            return false
    }

    IsNavigationContext() {
        if !WinActive("ahk_id " this.Gui.Hwnd)
            || this.PageKey = "clipboard" || this.PageKey = "quickPastes"
            || this.PageKey = "calendar"
            return false
        focused := DllCall("GetFocus", "ptr")
        if !focused
            return true
        try return WinGetClass("ahk_id " focused) != "Edit"
        catch
            return true
    }

    static CenteredY(areaTop, areaBottom, height) {
        return areaTop + Max(0, Floor(((areaBottom - areaTop) - height) / 2))
    }

    static BrandIconPath() {
        if A_IsCompiled
            return A_ScriptFullPath
        candidates := [A_ScriptDir "\assets\olio.ico", A_ScriptDir "\..\assets\olio.ico"]
        for candidate in candidates {
            if FileExist(candidate)
                return candidate
        }
        return candidates[1]
    }

    static SafeWorkstationOrigin(value) {
        value := Trim(String(value), " `t`r`n/")
        if !RegExMatch(value,
            "i)^https://([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)(?::([0-9]{1,5}))?$", &match)
            return ""
        return "https://" StrLower(match[1]) (match[2] ? ":" match[2] : "")
    }

    static ShouldRestoreFocus(currentForeground, launcherHwnd) {
        return currentForeground && WindowsInterop.RootWindow(currentForeground) = launcherHwnd
    }

    Show() {
        if this.CurrentView = "settings"
            this.Activate("clipboard", false)
        foreground := DllCall("GetForegroundWindow", "ptr")
        if foreground != this.Gui.Hwnd
            this.PreviousForeground := foreground
        requestedHeight := this.CurrentLogicalHeight()
        geometry := this.OpeningGeometry(requestedHeight, foreground)
        this.Gui.Show("x" geometry.X " y" geometry.Y " w" geometry.Width
            " h" geometry.Height)
        DllCall("RedrawWindow", "ptr", this.Gui.Hwnd, "ptr", 0, "ptr", 0,
            "uint", 0x0001 | 0x0004 | 0x0080 | 0x0100)
        TileRenderer.RefreshAll()
        this.RaiseUtilityLabels()
        if this.Buttons.Has(this.CurrentView) && this.Buttons[this.CurrentView].Enabled
            this.Buttons[this.CurrentView].Focus()
    }

    Hide(restoreFocus := true) {
        if IsObject(this.SettingsDialog) && this.SettingsDialog.IsVisible() {
            this.CloseSettingsDialog()
            return
        }
        if !this.IsVisible()
            return
        this.CloseSettingsDialog()
        this.CloseClipboardPreview(false)
        foreground := DllCall("GetForegroundWindow", "ptr")
        launcherOwnedFocus := LauncherWindow.ShouldRestoreFocus(foreground, this.Gui.Hwnd)
        this.Gui.Hide()
        this.ShowHome(false)
        if restoreFocus && launcherOwnedFocus
            WindowsInterop.RestoreForeground(this.PreviousForeground)
    }

    PrepareScreenshotCapture(hideLauncher := true) {
        if !hideLauncher {
            this.DirectScreenshotActive := true
            this.DirectScreenshotPriorAutoClose := this.AutoCloseOnDeactivate
            this.AutoCloseOnDeactivate := false
            return DllCall("GetForegroundWindow", "ptr")
        }
        previous := this.PreviousForeground
        if this.IsVisible() {
            this.Gui.Hide()
            this.ShowHome(false)
        }
        return previous
    }

    RestoreAfterScreenshot(previousForeground) {
        if this.DirectScreenshotActive {
            this.DirectScreenshotActive := false
            this.AutoCloseOnDeactivate := this.DirectScreenshotPriorAutoClose
        }
        if previousForeground && DllCall("IsWindow", "ptr", previousForeground) {
            WindowsInterop.RestoreForeground(previousForeground)
            return
        }
        this.Show()
    }

    Toggle() {
        if IsObject(this.SettingsDialog) && this.SettingsDialog.IsVisible() {
            this.CloseSettingsDialog()
            return
        }
        if this.IsVisible()
            this.Hide(true)
        else
            this.Show()
    }

    Activate(key, notify := true, *) {
        if key = "settings" {
            this.OpenPreferences()
            return
        }
        if !this.Buttons.Has(key) || !this.Buttons[key].Enabled
            key := "clipboard"
        this.CurrentView := key
        TileRenderer.SetSelected(this.Buttons[key].Hwnd)
        if notify {
            if key != "screenshot"
                this.ShowPage(key)
            this.NavigateCallback.Call(key)
        }
    }

    ShowPage(key) {
        if !this.PageDefinitions.Has(key)
            return
        page := this.PageDefinitions[key]
        for control in this.HomeControls
            control.Visible := false
        this.StatusText.Visible := false
        this.PageTitle.Text := page.Title
        this.PageTitle.SetFont("s16 bold c" ThemeManager.Hex("Text"),
            "Segoe UI Variable Text")
        this.PageSubtitle.Text := page.Subtitle
        for control in this.PageControls
            control.Visible := true
        for control in this.ClipboardControls
            control.Visible := false
        for control in this.ConnectionControls
            control.Visible := false
        for control in this.QuickPastesControls
            control.Visible := false
        for control in this.CalendarControls
            control.Visible := false
        this.PageKey := key
        if key = "clipboard" {
            this.PageSubtitle.Visible := false
            for control in this.ClipboardControls
                control.Visible := true
            this.Navigation.Controls := this.ClipboardActionControls
            this.RefreshClipboardHistory()
            if IsObject(this.ClipboardManager) && this.ClipboardManager.Entries.Length
                this.ClipboardList.Focus()
            else
                this.ClipboardClearButton.Focus()
        } else if key = "settings" {
            this.PageSubtitle.Visible := false
            for control in this.ConnectionControls
                control.Visible := true
            this.RefreshConnectionControls()
            if IsObject(this.ConnectionManager) && this.ConnectionManager.Credential
                this.ConnectionManager.RefreshStatus()
        } else if key = "quickPastes" {
            this.PageSubtitle.Visible := false
            for control in this.QuickPastesControls
                control.Visible := true
            if IsObject(this.QuickPastesManager)
                this.QuickPastesManager.Refresh()
            this.RefreshQuickPastes()
            if this.QuickVisibleItems.Length
                this.QuickPasteList.Focus()
            else if this.QuickRefreshButton.Enabled
                this.QuickRefreshButton.Focus()
            else if this.QuickSettingsButton.Visible
                this.QuickSettingsButton.Focus()
            else
                this.QuickPasteList.Focus()
        } else if key = "calendar" {
            this.PageSubtitle.Visible := false
            for control in this.CalendarControls
                control.Visible := true
            if IsObject(this.CalendarManager)
                this.CalendarManager.Refresh()
            this.RefreshCalendar()
            if this.CalendarVisibleItems.Length
                this.CalendarList.Focus()
            else if this.CalendarRefreshButton.Enabled
                this.CalendarRefreshButton.Focus()
            else
                this.CalendarConnectButton.Focus()
        } else {
            this.Navigation.Controls := [this.BackButton]
            this.BackButton.Focus()
        }
        this.ResizeForCurrentView()
        TileRenderer.RefreshAll()
        this.RaiseUtilityLabels()
    }

    ShowHome(focusSelected := true) {
        this.CloseClipboardPreview(false)
        if IsObject(this.ClipboardManager)
            this.ClipboardManager.ReleasePreviews()
        for control in this.ClipboardControls
            control.Visible := false
        for control in this.ConnectionControls
            control.Visible := false
        for control in this.QuickPastesControls
            control.Visible := false
        for control in this.CalendarControls
            control.Visible := false
        for control in this.PageControls
            control.Visible := false
        for control in this.HomeControls
            control.Visible := true
        this.StatusText.Visible := this.HasVisibleStatus
        this.PageKey := ""
        this.Navigation.Controls := this.EnabledButtons
        this.ResizeForCurrentView()
        if focusSelected && this.Buttons.Has(this.CurrentView)
            && this.Buttons[this.CurrentView].Enabled
            this.Buttons[this.CurrentView].Focus()
        TileRenderer.RefreshAll()
        this.RaiseUtilityLabels()
    }

    ResizeForCurrentView() {
        if !this.IsVisible()
            return
        logicalHeight := this.CurrentLogicalHeight()
        geometry := this.OpeningGeometry(logicalHeight, this.PreviousForeground)
        this.Gui.Show("x" geometry.X " y" geometry.Y " w" geometry.Width
            " h" geometry.Height)
    }

    OpeningGeometry(logicalHeight, foregroundHwnd := 0, areas := 0) {
        if !IsObject(areas)
            areas := WindowsInterop.MonitorWorkAreas()
        area := WindowsInterop.SelectWorkArea(areas,
            this.Settings["openingMonitor"], foregroundHwnd,
            this.Settings["rememberedMonitor"], this.Settings["rememberedX"],
            this.Settings["rememberedY"],
            this.Settings["rememberedPositionValid"])
        width := Round(this.LogicalWidth * area.Dpi / 96)
        height := Min(logicalHeight, area.Bottom - area.Top)
        coordinates := WindowsInterop.OpeningCoordinates(area, width, height,
            this.Settings["openingPosition"], this.Settings["rememberedX"],
            this.Settings["rememberedY"], this.Settings["rememberedPositionValid"])
        x := coordinates.X, y := coordinates.Y
        return WindowsInterop.ClampWindowPosition(area, x, y, width, height)
    }

    CurrentLogicalHeight() {
        baseHeight := this.PageKey = "clipboard" ? 500
            : this.PageKey = "quickPastes" ? 500
            : this.PageKey = "calendar" ? 500
            : this.PageKey = "settings" ? 400
            : (this.HasVisibleStatus ? 318 : 286)
        return Round(baseHeight * this.ScaleFactor)
    }

    OnClipboardHistoryChanged(status) {
        if this.PageKey = "clipboard"
            this.RefreshClipboardHistory(status)
    }

    RefreshClipboardHistory(status := "") {
        selected := this.SelectedClipboardIndex()
        DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
            "uint", 0x0184, "uptr", 0, "ptr", 0) ; LB_RESETCONTENT
        entries := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries : []
        for entry in entries {
            accessible := (entry.Kind = "text" ? "Text: " entry.SafePreview(160)
                : "Image " entry.Width " by " entry.Height)
                . ", " entry.DisplayTime
            if entry.Pinned
                accessible .= ", pinned"
            DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
                "uint", 0x0180, "uptr", 0, "str", accessible, "ptr") ; LB_ADDSTRING
        }
        if entries.Length {
            selected := Min(Max(selected, 1), entries.Length)
            DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
                "uint", 0x0186, "uptr", selected - 1, "ptr", 0) ; LB_SETCURSEL
        }
        dpi := DllCall("GetDpiForWindow", "ptr", this.Gui.Hwnd, "uint")
        if !dpi
            dpi := 96
        DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
            "uint", 0x01A0, "uptr", 0, "ptr", Round(98 * dpi / 96)) ; LB_SETITEMHEIGHT
        countText := entries.Length " item" (entries.Length = 1 ? "" : "s")
        if status = "oversized-text"
            countText := "Text was too large and was not saved"
        else if status = "oversized-image" || status = "invalid-image"
            countText := "Image was too large or unsupported"
        else if status = "excluded"
            countText := "Copy ignored for a sensitive application"
        else if IsObject(this.ClipboardManager) && this.ClipboardManager.Paused
            countText := "Capture paused"
        this.ClipboardStatus.Text := countText
        DllCall("InvalidateRect", "ptr", this.ClipboardList.Hwnd, "ptr", 0, "int", true)
        this.UpdateClipboardOpenState()
        TileRenderer.RefreshAll()
    }

    SelectedClipboardIndex() {
        if !IsObject(this.ClipboardList)
            return 0
        selected := DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
            "uint", 0x0188, "uptr", 0, "ptr", 0, "ptr") ; LB_GETCURSEL
        return selected < 0 || selected > 10000 ? 0 : selected + 1
    }

    UpdateClipboardOpenState() {
        index := this.SelectedClipboardIndex()
        enabled := IsObject(this.ClipboardManager) && index
            && index <= this.ClipboardManager.Entries.Length
            && this.ClipboardManager.Entries[index].Kind = "image"
        TileRenderer.SetEnabled(this.ClipboardOpenButton, enabled)
        return enabled
    }

    OpenClipboardPreview() {
        index := this.SelectedClipboardIndex()
        if !IsObject(this.ClipboardManager) || !index
            return false
        entry := this.ClipboardManager.Entries[index]
        if entry.Kind != "image" || !IsObject(entry.Dib)
            return false
        details := this.ClipboardManager.ValidateDib(entry.Dib)
        if !details.Ok
            return false
        this.CloseClipboardPreview(false)
        this.PreviewPriorAutoClose := this.AutoCloseOnDeactivate
        this.LastPreviewError := ""
        this.AutoCloseOnDeactivate := false
        this.Gui.Opt("+Disabled")
        try {
            this.PreviewWindow := ClipboardPreviewWindow(this.Gui, entry, details,
                (*) => this.OnClipboardPreviewClosed())
            return true
        } catch as previewError {
            this.PreviewWindow := 0
            this.Gui.Opt("-Disabled")
            this.AutoCloseOnDeactivate := this.PreviewPriorAutoClose
            this.LastPreviewError := previewError.Message
            this.ClipboardStatus.Text := "Image preview could not be opened"
            return false
        }
    }

    OnClipboardPreviewClosed() {
        this.PreviewWindow := 0
        try this.Gui.Opt("-Disabled")
        this.AutoCloseOnDeactivate := this.PreviewPriorAutoClose
        if this.IsVisible() {
            DllCall("SetForegroundWindow", "ptr", this.Gui.Hwnd)
            if this.ClipboardOpenButton.Enabled
                this.ClipboardOpenButton.Focus()
            else
                this.ClipboardList.Focus()
        }
    }

    CloseClipboardPreview(restoreParent := true) {
        if !IsObject(this.PreviewWindow)
            return
        preview := this.PreviewWindow
        this.PreviewWindow := 0
        preview.Close(false)
        try this.Gui.Opt("-Disabled")
        this.AutoCloseOnDeactivate := this.PreviewPriorAutoClose
        if restoreParent && this.IsVisible()
            DllCall("SetForegroundWindow", "ptr", this.Gui.Hwnd)
    }

    ActivateClipboardFocused() {
        focused := DllCall("GetFocus", "ptr")
        if focused = this.ClipboardList.Hwnd {
            this.ActivateClipboardSelection()
            return
        }
        for control in this.ClipboardActionControls {
            if control.Hwnd = focused {
                DllCall("SendMessageW", "ptr", focused, "uint", 0x00F5,
                    "uptr", 0, "ptr", 0) ; BM_CLICK
                return
            }
        }
    }

    ConfirmClearClipboard() {
        if !IsObject(this.ClipboardManager) || !this.ClipboardManager.Entries.Length
            return
        previousAutoClose := this.AutoCloseOnDeactivate
        this.AutoCloseOnDeactivate := false
        this.Gui.Opt("+OwnDialogs")
        try answer := MsgBox("Clear every clipboard-history item?`n`nThis cannot be undone.",
            "Clear clipboard history", "YesNo Icon! Default2")
        finally this.AutoCloseOnDeactivate := previousAutoClose
        if answer = "Yes"
            this.ClipboardManager.Clear()
    }

    ActivateClipboardSelection(index := 0) {
        if !index
            index := this.SelectedClipboardIndex()
        if !IsObject(this.ClipboardManager) || !index
            return
        if !this.ClipboardManager.RestoreAndPromote(index) {
            this.ClipboardStatus.Text := "Clipboard is temporarily unavailable"
            return
        }
        DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
            "uint", 0x0186, "uptr", 0, "ptr", 0) ; promoted item is selected
        this.AfterItemSelection("clipboard")
    }

    OnListMouseUp(wParam, lParam, msg, hwnd) {
        isClipboard := this.PageKey = "clipboard" && hwnd = this.ClipboardList.Hwnd
        isQuickPaste := this.PageKey = "quickPastes" && hwnd = this.QuickPasteList.Hwnd
        if !isClipboard && !isQuickPaste
            return
        hit := DllCall("SendMessageW", "ptr", hwnd, "uint", 0x01A9,
            "uptr", 0, "ptr", lParam, "ptr") ; LB_ITEMFROMPOINT
        if ((hit >> 16) & 0xFFFF)
            return
        index := (hit & 0xFFFF) + 1
        maximum := isClipboard && IsObject(this.ClipboardManager)
            ? this.ClipboardManager.Entries.Length : this.QuickVisibleItems.Length
        if index > maximum
            return
        DllCall("SendMessageW", "ptr", hwnd, "uint", 0x0186,
            "uptr", index - 1, "ptr", 0)
        if isClipboard {
            this.UpdateClipboardOpenState()
            SetTimer(() => this.ActivateClipboardSelection(index), -1)
        } else {
            this.UpdateQuickPasteActionState()
            this.ChooseQuickPasteSelection(index)
        }
    }

    OnQuickPasteMouseWheel(wParam, lParam, msg, hwnd) {
        if this.PageKey != "quickPastes"
            || !this.QuickVisibleItems.Length
            || hwnd != this.QuickPasteList.Hwnd
            return
        delta := (wParam >> 16) & 0xFFFF
        if delta >= 0x8000
            delta -= 0x10000
        if !delta
            return 0
        this.QuickWheelRemainder += delta
        if Abs(this.QuickWheelRemainder) < 120
            return 0
        notches := this.QuickWheelRemainder > 0
            ? Floor(this.QuickWheelRemainder / 120)
            : Ceil(this.QuickWheelRemainder / 120)
        this.QuickWheelRemainder -= notches * 120
        current := DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") ; LB_GETTOPINDEX
        target := Max(0, Min(this.QuickVisibleItems.Length - 1,
            current - (notches * 2)))
        DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x0197, "uptr", target, "ptr", 0) ; LB_SETTOPINDEX
        return 0
    }

    DeleteClipboardSelection() {
        index := this.SelectedClipboardIndex()
        if IsObject(this.ClipboardManager) && index
            this.ClipboardManager.Delete(index)
    }

    OnQuickPastesChanged(state, detail) {
        if this.PageKey = "quickPastes" {
            focused := DllCall("GetFocus", "ptr")
            this.RefreshQuickPastes()
            if state = "ready" && this.QuickVisibleItems.Length
                && (!focused || focused = this.QuickRefreshButton.Hwnd)
                this.QuickPasteList.Focus()
        }
    }

    RefreshQuickPastes() {
        manager := this.QuickPastesManager
        this.QuickStatus.Text := IsObject(manager) ? manager.Detail
            : "Quick Paste synchronization is unavailable in this isolated mode."
        this.RefreshQuickPasteList()

        hasCredential := IsObject(this.ConnectionManager)
            && this.ConnectionManager.Credential
        busy := IsObject(manager) && manager.RequestBusy
        needsSettings := !hasCredential || !IsObject(manager)
            || manager.State = "disconnected" || manager.State = "revoked"
            || manager.State = "scope-required"
        TileRenderer.SetEnabled(this.QuickRefreshButton, hasCredential && !busy)
        this.QuickSearchEdit.Enabled := IsObject(manager) && manager.Items.Length > 0
        TileRenderer.SetEnabled(this.QuickSettingsButton, true)
        this.QuickSettingsButton.Visible := needsSettings
        this.QuickCopyButton.Visible := !needsSettings
        this.QuickPasteButton.Visible := !needsSettings
        this.UpdateQuickPasteActionState()
        this.Navigation.Controls := [this.BackButton, this.QuickRefreshButton,
            this.QuickSearchEdit, this.QuickPasteList]
        if needsSettings
            this.Navigation.Controls.Push(this.QuickSettingsButton)
        else {
            this.Navigation.Controls.Push(this.QuickCopyButton)
            this.Navigation.Controls.Push(this.QuickPasteButton)
        }
        this.QuickFooter.Text := this.QuickLastFeedback
            ? this.QuickLastFeedback
            : (IsObject(manager) ? manager.LastSyncDisplay() : "Waiting for first sync")
        TileRenderer.RefreshAll()
    }

    RefreshQuickPasteList() {
        selectedItem := this.SelectedQuickPaste()
        selectedId := IsObject(selectedItem) ? selectedItem.Id : ""
        manager := this.QuickPastesManager
        this.QuickVisibleItems := IsObject(manager)
            ? manager.Filter(this.QuickSearchEdit.Value)
            : []
        DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x0184, "uptr", 0, "ptr", 0)
        selected := 1
        for index, item in this.QuickVisibleItems {
            accessible := (item.IsFavorite ? "Favorite, " : "")
                . item.SafeTitle(100)
            if item.Category
                accessible .= ", category " item.SafeCategory(50)
            accessible .= ", " item.SafeContent(180)
            DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
                "uint", 0x0180, "uptr", 0, "str", accessible, "ptr")
            if selectedId && item.Id = selectedId
                selected := index
        }
        if this.QuickVisibleItems.Length {
            selected := Min(selected, this.QuickVisibleItems.Length)
            DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
                "uint", 0x0186, "uptr", selected - 1, "ptr", 0)
        }
        dpi := DllCall("GetDpiForWindow", "ptr", this.Gui.Hwnd, "uint")
        if !dpi
            dpi := 96
        DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x01A0, "uptr", 0, "ptr", Round(98 * dpi / 96))
        DllCall("InvalidateRect", "ptr", this.QuickPasteList.Hwnd,
            "ptr", 0, "int", true)
        this.UpdateQuickPasteActionState()
    }

    SelectedQuickPasteIndex() {
        selected := DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x0188, "uptr", 0, "ptr", 0, "ptr")
        return selected < 0 || selected > 10000 ? 0 : selected + 1
    }

    SelectedQuickPaste() {
        index := this.SelectedQuickPasteIndex()
        return index && index <= this.QuickVisibleItems.Length
            ? this.QuickVisibleItems[index] : 0
    }

    UpdateQuickPasteActionState() {
        enabled := IsObject(this.SelectedQuickPaste())
        TileRenderer.SetEnabled(this.QuickCopyButton, enabled)
        TileRenderer.SetEnabled(this.QuickPasteButton, enabled)
        return enabled
    }

    RefreshQuickPastesNow() {
        this.QuickLastFeedback := ""
        if IsObject(this.QuickPastesManager)
            this.QuickPastesManager.Refresh()
    }

    CopyQuickPasteSelection(index := 0) {
        item := index && index <= this.QuickVisibleItems.Length
            ? this.QuickVisibleItems[index] : this.SelectedQuickPaste()
        if !IsObject(item) || !IsObject(this.ClipboardManager)
            return false
        if !this.ClipboardManager.PublishText(item.Content) {
            this.SetQuickFeedback("The clipboard is temporarily unavailable.", true)
            return false
        }
        this.SetQuickFeedback("Copied selected Quick Paste.")
        return true
    }

    ChooseQuickPasteSelection(index := 0) {
        if !this.CopyQuickPasteSelection(index)
            return false
        return this.AfterItemSelection("quick-paste")
    }

    AfterItemSelection(kind) {
        if this.Settings["autoPasteAfterSelection"] {
            target := this.PreviousForeground
            this.Hide(false)
            if this.PasteRunner.Call(target) {
                try TrayTip("Selected item inserted.", "Olio Launcher", 0x1)
                return true
            }
            if kind = "quick-paste"
                this.SetQuickFeedback(
                    "Copied; Windows could not insert it. Paste manually.", true)
            else
                this.ClipboardStatus.Text :=
                    "Copied; Windows could not insert it. Paste manually."
            try TrayTip(
                "Item copied, but Windows could not insert it. Paste manually.",
                "Olio Launcher", 0x2)
            return false
        }
        if this.Settings["closeAfterSelection"]
            this.Hide(true)
        return true
    }

    PasteQuickPasteSelection() {
        target := this.PreviousForeground
        if !this.CopyQuickPasteSelection()
            return false
        this.Hide(false)
        if this.PasteRunner.Call(target) {
            try TrayTip("Quick Paste inserted.", "Olio Launcher", 0x1)
            return true
        }
        this.SetQuickFeedback("Copied; Windows could not insert it. Paste manually.", true)
        try TrayTip("Quick Paste copied, but Windows could not insert it. Paste manually.",
            "Olio Launcher", 0x2)
        return false
    }

    SetQuickFeedback(text, isError := false) {
        this.QuickLastFeedback := text
        this.QuickFooter.SetFont("s8 c" ThemeManager.Hex(
            isError ? "ErrorText" : "SuccessText"),
            "Segoe UI Variable Text")
        this.QuickFooter.Text := text
        WindowsInterop.AnnounceStatus(this.QuickFooter)
    }

    ActivateQuickPasteFocused() {
        focused := DllCall("GetFocus", "ptr")
        if focused = this.QuickPasteList.Hwnd {
            this.ChooseQuickPasteSelection()
            return
        }
        for control in this.Navigation.Controls {
            if control.Hwnd = focused {
                DllCall("SendMessageW", "ptr", focused, "uint", 0x00F5,
                    "uptr", 0, "ptr", 0)
                return
            }
        }
    }

    OnCalendarChanged(state, detail) {
        if IsObject(this.SettingsDialog) && this.SettingsDialog.IsVisible()
            this.SettingsDialog.OnCalendarChanged(state, detail)
        if this.PageKey = "calendar" {
            focused := DllCall("GetFocus", "ptr")
            this.RefreshCalendar()
            if state = "ready" && this.CalendarVisibleItems.Length
                && (!focused || focused = this.CalendarRefreshButton.Hwnd)
                this.CalendarList.Focus()
        }
    }

    RefreshCalendar() {
        manager := this.CalendarManager
        this.CalendarStatus.Text := IsObject(manager) ? manager.Detail
            : "Calendar synchronization is unavailable in this isolated mode."
        this.CalendarVisibleItems := IsObject(manager) ? manager.RemainingItems() : []
        DllCall("SendMessageW", "ptr", this.CalendarList.Hwnd,
            "uint", 0x0184, "uptr", 0, "ptr", 0)
        for item in this.CalendarVisibleItems {
            accessible := item.TimeText() ", " item.SafeTitle(120)
            if item.Location
                accessible .= ", " item.SafeLocation(100)
            DllCall("SendMessageW", "ptr", this.CalendarList.Hwnd,
                "uint", 0x0180, "uptr", 0, "str", accessible, "ptr")
        }
        if this.CalendarVisibleItems.Length
            DllCall("SendMessageW", "ptr", this.CalendarList.Hwnd,
                "uint", 0x0186, "uptr", 0, "ptr", 0)
        dpi := DllCall("GetDpiForWindow", "ptr", this.Gui.Hwnd, "uint")
        if !dpi
            dpi := 96
        DllCall("SendMessageW", "ptr", this.CalendarList.Hwnd,
            "uint", 0x01A0, "uptr", 0, "ptr", Round(76 * dpi / 96))
        DllCall("InvalidateRect", "ptr", this.CalendarList.Hwnd,
            "ptr", 0, "int", true)

        hasCredential := IsObject(this.ConnectionManager)
            && this.ConnectionManager.Credential
        busy := IsObject(manager) && manager.RequestBusy
        needsSettings := !hasCredential || !IsObject(manager)
            || manager.State = "disconnected" || manager.State = "revoked"
            || manager.State = "calendar-not-connected"
            || manager.State = "scope-required"
            || manager.State = "calendar-reconnect-required"
        TileRenderer.SetEnabled(this.CalendarRefreshButton, hasCredential && !busy)
        TileRenderer.SetEnabled(this.CalendarConnectButton, true)
        this.CalendarConnectButton.Visible := needsSettings
        this.CalendarFooter.Text := IsObject(manager)
            ? manager.LastSyncDisplay() : "Not updated yet"
        this.Navigation.Controls := [this.BackButton, this.CalendarRefreshButton,
            this.CalendarList]
        if needsSettings
            this.Navigation.Controls.Push(this.CalendarConnectButton)
        TileRenderer.RefreshAll()
    }

    RefreshCalendarNow() {
        if IsObject(this.CalendarManager)
            this.CalendarManager.Refresh()
    }

    OpenCalendarSettings() {
        if !IsObject(this.ConnectionManager)
            return false
        origin := LauncherWindow.SafeWorkstationOrigin(this.ConnectionManager.Origin)
        if !origin
            return false
        try {
            Run(origin "/profile")
            return true
        } catch {
            this.CalendarStatus.Text := "Calendar settings could not be opened."
            return false
        }
    }

    OnConnectionChanged(state, detail) {
        if IsObject(this.SettingsDialog) && this.SettingsDialog.IsVisible()
            this.SettingsDialog.OnConnectionChanged(state, detail)
    }

    RefreshConnectionControls() {
        manager := this.ConnectionManager
        state := IsObject(manager) ? manager.State : "unavailable"
        connectionDetail := IsObject(manager) ? manager.Detail
            : "Connection controls are unavailable in this isolated mode."
        this.ConnectionStatus.Text := connectionDetail
        waiting := state = "starting" || state = "waiting" || state = "exchanging"
        connected := state = "connected" || state = "checking" || state = "disconnecting"
        hasCredential := IsObject(manager) && manager.Credential
        hasPairing := IsObject(manager) && manager.RequestId && manager.PairingSecret
        recoveryPairing := hasPairing && !waiting
        recoveryCredential := hasCredential && !waiting && !connected
        this.ConnectionConnectButton.Visible := !waiting && !connected && !hasCredential && !hasPairing
        this.ConnectionCancelButton.Visible := waiting || recoveryPairing
        this.ConnectionRetryButton.Visible := recoveryCredential || recoveryPairing
        this.ConnectionDisconnectButton.Visible := connected || recoveryCredential
        this.PreferencesButton.Visible := true
        inner := this.LogicalWidth - 32
        half := Floor((inner - 8) / 2)
        if recoveryPairing {
            this.ConnectionRetryButton.Move(16, 308, half, 42)
            this.ConnectionCancelButton.Move(24 + half, 308, half, 42)
        } else {
            this.ConnectionCancelButton.Move(16, 308, inner, 42)
            this.ConnectionRetryButton.Move(16, 308, half, 42)
        }
        if recoveryCredential
            this.ConnectionDisconnectButton.Move(24 + half, 308, half, 42)
        else
            this.ConnectionDisconnectButton.Move(16, 308, inner, 42)
        busy := IsObject(manager) && manager.RequestBusy
        TileRenderer.SetEnabled(this.ConnectionConnectButton, IsObject(manager) && !busy)
        TileRenderer.SetEnabled(this.ConnectionCancelButton, IsObject(manager) && !busy)
        TileRenderer.SetEnabled(this.ConnectionRetryButton, IsObject(manager) && !busy)
        TileRenderer.SetEnabled(this.ConnectionDisconnectButton, IsObject(manager) && !busy)
        TileRenderer.SetEnabled(this.PreferencesButton, true)
        this.ConnectionNameEdit.Enabled := !waiting && !connected
        controls := [this.BackButton, this.PreferencesButton, this.ConnectionNameEdit]
        for button in [this.ConnectionConnectButton, this.ConnectionCancelButton,
            this.ConnectionRetryButton, this.ConnectionDisconnectButton] {
            if button.Visible && button.Enabled
                controls.Push(button)
        }
        this.Navigation.Controls := controls
        TileRenderer.RefreshAll()
        this.RaiseUtilityLabels()
    }

    StartConnection() {
        if !IsObject(this.ConnectionManager)
            return
        this.ConnectionManager.StartPairing(this.ConnectionNameEdit.Value)
    }

    OpenPreferences() {
        if IsObject(this.SettingsDialog) && this.SettingsDialog.IsVisible() {
            this.SettingsDialog.Focus()
            return
        }
        previousAutoClose := this.AutoCloseOnDeactivate
        this.SettingsDialogPriorAutoClose := previousAutoClose
        this.AutoCloseOnDeactivate := false
        try this.SettingsDialog := SettingsDialog(this.Gui, this.Settings,
            (action, changes) => this.ApplySettingsRequest(action, changes),
            (*) => this.OnSettingsDialogClosed(), this.VisualTestMode,
            this.ConnectionManager, this.CalendarManager)
        catch {
            this.SettingsDialog := 0
            this.AutoCloseOnDeactivate := previousAutoClose
            this.SetStatus("Settings could not be opened.")
            return
        }
        if this.IsVisible() {
            this.Gui.Hide()
            this.ShowHome(false)
        }
    }

    ApplySettingsRequest(action, changes) {
        if IsObject(this.SettingsApplyCallback)
            result := this.SettingsApplyCallback.Call(action, changes)
        else {
            try {
                if action = "reset"
                    values := SettingsManager.ResetPreservingConnection()
                else {
                    validation := HotkeyManager.Validate(changes["focusKey"])
                    if !validation.Ok
                        return {Ok: false,
                            Message: "The Focus Key is invalid, reserved, or unavailable."}
                    values := SettingsManager.UpdateMany(changes)
                }
                result := {Ok: true, Values: values}
            } catch {
                result := {Ok: false, Message: "Settings could not be saved. Nothing changed."}
            }
        }
        if IsObject(result) && result.Ok && result.HasOwnProp("Values")
            this.ApplyRuntimeSettings(result.Values)
        return result
    }

    ApplyRuntimeSettings(settings) {
        this.Settings := settings
        this.AutoCloseOnDeactivate := settings["closeOnFocusLost"]
            && !this.VisualTestMode
        this.Gui.Opt(settings["alwaysOnTop"] ? "+AlwaysOnTop" : "-AlwaysOnTop")
        this.LayoutForLauncherScale(settings["launcherScale"])
        if IsObject(this.ClipboardManager)
            this.ClipboardManager.ApplySettings(settings)
        this.ApplyTheme()
        this.ResizeForCurrentView()
    }

    OnSettingsDialogClosed() {
        this.SettingsDialog := 0
        this.AutoCloseOnDeactivate := this.Settings["closeOnFocusLost"]
            && !this.VisualTestMode
    }

    CloseSettingsDialog() {
        if !IsObject(this.SettingsDialog)
            return
        dialog := this.SettingsDialog
        this.SettingsDialog := 0
        dialog.Close()
    }

    ConfirmDisconnect() {
        if !IsObject(this.ConnectionManager) || !this.ConnectionManager.Credential
            return
        previousAutoClose := this.AutoCloseOnDeactivate
        this.AutoCloseOnDeactivate := false
        this.Gui.Opt("+OwnDialogs")
        try answer := MsgBox("Disconnect this Olio Launcher?`n`n"
            "Workstation access will be revoked and the protected local credential removed.",
            "Disconnect Olio account", "YesNo Icon! Default2")
        finally this.AutoCloseOnDeactivate := previousAutoClose
        if answer = "Yes"
            this.ConnectionManager.Disconnect()
    }

    RaiseUtilityLabels() {
        for label in [this.SettingsLabel, this.BackLabel] {
            if !label.Visible
                continue
            DllCall("SetWindowPos", "ptr", label.Hwnd, "ptr", 0,
                "int", 0, "int", 0, "int", 0, "int", 0,
                "uint", 0x0001 | 0x0002 | 0x0010)
            DllCall("RedrawWindow", "ptr", label.Hwnd, "ptr", 0, "ptr", 0,
                "uint", 0x0001 | 0x0100)
        }
    }

    HandleEscape() {
        if this.PageKey
            this.ShowHome()
        else
            this.Hide(true)
    }

    SetStatus(text) {
        routine := InStr(text, "Focus Key:") = 1 && !InStr(text, "error") && !InStr(text, "failed")
        if routine {
            this.HasVisibleStatus := false
            this.StatusText.Visible := false
            return
        }
        this.HasVisibleStatus := true
        this.StatusText.Text := text
        this.StatusText.Visible := true
        WindowsInterop.AnnounceStatus(this.StatusText)
    }

    OnCommand(wParam, lParam, msg, hwnd) {
        try guiHwnd := this.Gui.Hwnd
        catch
            return
        if hwnd != guiHwnd || !lParam
            return
        notification := (wParam >> 16) & 0xFFFF
        if lParam = this.ClipboardList.Hwnd && notification = 1 {
            this.UpdateClipboardOpenState()
            return 0
        }
        if lParam = this.QuickPasteList.Hwnd && notification = 1 {
            this.UpdateQuickPasteActionState()
            return 0
        }
        if notification = 0 && this.ButtonKeysByHwnd.Has(lParam) {
            key := this.ButtonKeysByHwnd[lParam]
            if key = "__back" {
                this.ShowHome()
                return 0
            }
            switch key {
                case "__clip_clear": this.ConfirmClearClipboard()
                case "__clip_open": this.OpenClipboardPreview()
                case "__clip_delete": this.DeleteClipboardSelection()
                case "__preferences": this.OpenPreferences()
                case "__connection_connect": this.StartConnection()
                case "__connection_cancel": this.ConnectionManager.CancelPairing()
                case "__connection_retry": this.ConnectionManager.Retry()
                case "__connection_disconnect": this.ConfirmDisconnect()
                case "__quick_refresh": this.RefreshQuickPastesNow()
                case "__quick_copy": this.CopyQuickPasteSelection()
                case "__quick_paste": this.PasteQuickPasteSelection()
                case "__quick_settings": this.OpenPreferences()
                case "__calendar_refresh": this.RefreshCalendarNow()
                case "__calendar_settings": this.OpenCalendarSettings()
                default:
                    if key = "settings"
                        this.OpenPreferences()
                    else if this.Buttons[key].Enabled
                        this.Activate(key)
            }
            return 0
        }
    }

    OnWindowActivate(wParam, lParam, msg, hwnd) {
        try guiHwnd := this.Gui.Hwnd
        catch
            return
        if hwnd != guiHwnd || !this.AutoCloseOnDeactivate
            return
        if (wParam & 0xFFFF) = 0 && this.IsVisible()
            SetTimer((*) => this.CloseAfterFocusLoss(), -100)
    }

    OnApplicationActivate(wParam, lParam, msg, hwnd) {
        try guiHwnd := this.Gui.Hwnd
        catch
            return
        if hwnd != guiHwnd || wParam || !this.AutoCloseOnDeactivate
            return
        if this.IsVisible()
            SetTimer((*) => this.CloseAfterFocusLoss(), -100)
    }

    CloseAfterFocusLoss() {
        if !this.AutoCloseOnDeactivate || !this.IsVisible()
            return
        foreground := DllCall("GetForegroundWindow", "ptr")
        if !LauncherWindow.ShouldCloseAfterFocusLoss(foreground, this.Gui.Hwnd)
            return
        this.Hide(false)
    }

    static ShouldCloseAfterFocusLoss(foreground, launcherHwnd) {
        return !foreground || WindowsInterop.RootWindow(foreground) != launcherHwnd
    }

    OnDpiChanged(wParam, lParam, msg, hwnd) {
        try guiHwnd := this.Gui.Hwnd
        catch
            return
        if hwnd != guiHwnd
            return
        left := NumGet(lParam, 0, "int"), top := NumGet(lParam, 4, "int")
        right := NumGet(lParam, 8, "int"), bottom := NumGet(lParam, 12, "int")
        DllCall("SetWindowPos", "ptr", hwnd, "ptr", 0, "int", left, "int", top,
            "int", right - left, "int", bottom - top, "uint", 0x0014)
        return 0
    }
}
