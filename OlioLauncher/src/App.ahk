class OlioApp {
    static Window := 0
    static Settings := 0
    static Clipboard := 0
    static Screenshot := 0
    static Connection := 0
    static QuickPastes := 0
    static Calendar := 0
    static CalendarRefreshCallback := 0
    static CalendarRefreshIntervalMs := 7200000
    static PendingActivation := false
    static FocusCallback := 0
    static FocusReleaseCallback := 0
    static FocusGesture := 0
    static PendingFocusToggleCallback := 0

    static Start(mode := "") {
        activation := (*) => this.OnSecondaryActivation()
        measurementMode := mode = "--measure-m3"
        instanceNamespace := mode = "--visual-test" ? ".VisualTest"
            : measurementMode ? ".M3Measurement" : ""
        if !InstanceCoordinator.BecomePrimary(activation, instanceNamespace)
            ExitApp(0)

        this.Settings := measurementMode ? SettingsManager.Defaults() : SettingsManager.Load()
        RedactedLogger.Configure(measurementMode ? false : this.Settings["loggingEnabled"])
        RedactedLogger.Write("app-start", "primary")
        for warning in SettingsManager.Warnings
            RedactedLogger.Write("settings-warning", warning)

        startup := measurementMode
            ? {Ok: true, Status: "measurement-no-system-change"}
            : StartupManager.Apply(this.Settings["startWithWindows"])
        RedactedLogger.Write("startup-registration", startup.Status)

        this.Clipboard := ClipboardManager(this.Settings)
        this.Connection := (mode = "--measure-m3" || mode = "--visual-test")
            ? 0 : LauncherConnection(this.Settings)
        this.QuickPastes := IsObject(this.Connection)
            ? QuickPastesClient(this.Connection) : 0
        this.Calendar := IsObject(this.Connection)
            ? CalendarClient(this.Connection) : 0
        this.Screenshot := ScreenshotManager(this.Clipboard,
            (status, previous, result) => this.OnScreenshotFinished(status, previous, result))
        this.Window := LauncherWindow(this.Settings, (key) => this.OnNavigate(key),
            mode = "--visual-test", this.Clipboard, this.Connection, this.QuickPastes,
            (action, changes) => this.ApplySettings(action, changes), this.Calendar)
        if IsObject(this.Connection) {
            this.Connection.ChangedCallback := (state, detail) =>
                this.OnConnectionChanged(state, detail)
            this.Connection.CredentialClearedCallback := (reason) =>
                this.OnCredentialCleared(reason)
        }
        if IsObject(this.QuickPastes)
            this.QuickPastes.ChangedCallback := (state, detail) =>
                this.Window.OnQuickPastesChanged(state, detail)
        if IsObject(this.Calendar)
            this.Calendar.ChangedCallback := (state, detail) =>
                this.Window.OnCalendarChanged(state, detail)
        if IsObject(this.Calendar) {
            this.CalendarRefreshCallback := (*) => this.RefreshCalendarInBackground()
            SetTimer(this.CalendarRefreshCallback, -15000)
        }
        this.Clipboard.ChangedCallback := (status) => this.Window.OnClipboardHistoryChanged(status)
        this.Clipboard.Start()
        this.FocusGesture := FocusKeyGesture(350)
        this.PendingFocusToggleCallback := (*) => this.CommitPendingFocusToggle()
        this.FocusCallback := (*) => this.OnFocusKeyPressed()
        this.FocusReleaseCallback := (*) => this.OnFocusKeyReleased()
        hotkeyResult := HotkeyManager.Register(this.Settings["focusKey"],
            this.FocusCallback, this.FocusReleaseCallback)
        if !hotkeyResult.Ok && this.Settings["focusKey"] != "#+F23" {
            fallback := HotkeyManager.Register("#+F23", this.FocusCallback,
                this.FocusReleaseCallback)
            if fallback.Ok
                hotkeyResult := {Ok: true, Status: "Configured Focus Key failed; using #+F23"}
        }
        status := hotkeyResult.Status
        if SettingsManager.Warnings.Length
            status .= " | Settings recovered: " SettingsManager.Warnings.Length
        if !startup.Ok
            status .= " | Startup registration failed"
        this.Window.SetStatus(status)
        RedactedLogger.Write("focus-key-registration", hotkeyResult.Ok ? "ok" : "error")
        this.ConfigureTray()

        if (mode != "--background" && mode != "--measure-m3") || this.PendingActivation
            this.Window.Show()
    }

    static OnSecondaryActivation(*) {
        if IsObject(this.Window) {
            this.CancelPendingFocusToggle(true)
            this.Toggle()
        } else
            this.PendingActivation := true
        return 0
    }

    static Toggle(*) {
        if IsObject(this.Screenshot) && this.Screenshot.Active
            return
        if IsObject(this.Window)
            this.Window.Toggle()
    }

    static OnFocusKeyPressed(*) {
        if IsObject(this.Screenshot) && this.Screenshot.Active
            return
        if !IsObject(this.FocusGesture)
            this.FocusGesture := FocusKeyGesture(350)
        if this.FocusGesture.Press() {
            this.CancelPendingFocusToggle(false)
            this.BeginScreenshot(false)
            return
        }
        if this.FocusGesture.LastResult = "first"
            SetTimer(this.PendingFocusToggleCallback,
                -this.FocusGesture.MaxIntervalMs)
    }

    static OnFocusKeyReleased(*) {
        if IsObject(this.FocusGesture)
            this.FocusGesture.Release()
    }

    static CommitPendingFocusToggle() {
        if IsObject(this.Screenshot) && this.Screenshot.Active
            return
        this.Toggle()
    }

    static CancelPendingFocusToggle(resetGesture := false) {
        if IsObject(this.PendingFocusToggleCallback)
            try SetTimer(this.PendingFocusToggleCallback, 0)
        if resetGesture && IsObject(this.FocusGesture)
            this.FocusGesture.Reset()
    }

    static ImmediateToggle(*) {
        this.CancelPendingFocusToggle(true)
        this.Toggle()
    }

    static BeginScreenshot(hideLauncher := true) {
        if !IsObject(this.Window) || !IsObject(this.Screenshot)
            return false
        if this.Screenshot.Active
            return false
        this.CancelPendingFocusToggle(hideLauncher)
        previous := this.Window.PrepareScreenshotCapture(hideLauncher)
        return this.Screenshot.Begin(previous)
    }

    static OnNavigate(key) {
        if key = "screenshot"
            this.BeginScreenshot(true)
        try {
            SettingsManager.Update("lastSelected", key)
            RedactedLogger.Write("navigation", key)
        } catch as settingsError {
            RedactedLogger.Write("settings-write", "error")
            this.Window.SetStatus("Settings write failed; defaults remain active")
        }
    }

    static OnConnectionChanged(state, detail) {
        if IsObject(this.Window)
            this.Window.OnConnectionChanged(state, detail)
        if !IsObject(this.QuickPastes)
            return
        if state = "connected" && !this.QuickPastes.Items.Length
            this.QuickPastes.SetState("connected", "Ready to synchronize.")
        else if state = "revoked"
            this.QuickPastes.Clear("revoked",
                "This launcher was revoked. Connect again in Settings.")
        else if state = "disconnected"
            this.QuickPastes.Clear("disconnected",
                "Connect an Olio account in Settings.")
        if !IsObject(this.Calendar)
            return
        if state = "connected" && !this.Calendar.Items.Length
            this.Calendar.SetState("connected", "Ready to load today's schedule.")
        else if state = "revoked"
            this.Calendar.Clear("revoked",
                "This launcher was revoked. Connect again in Settings.")
        else if state = "disconnected"
            this.Calendar.Clear("disconnected", "Connect an Olio account in Settings.")
    }

    static OnCredentialCleared(reason) {
        state := reason = "revoked" ? "revoked" : "disconnected"
        detail := reason = "revoked"
            ? "This launcher was revoked. Connect again in Settings."
            : "Connect an Olio account in Settings."
        if IsObject(this.QuickPastes)
            this.QuickPastes.Clear(state, detail)
        if IsObject(this.Calendar)
            this.Calendar.Clear(state, detail)
    }

    static RefreshCalendarInBackground() {
        if IsObject(this.Calendar) && IsObject(this.Connection)
            && this.Connection.Credential
            this.Calendar.Refresh()
        if IsObject(this.CalendarRefreshCallback)
            SetTimer(this.CalendarRefreshCallback, this.CalendarRefreshIntervalMs)
    }

    static OnScreenshotFinished(status, previous, result) {
        RedactedLogger.Write("capture-result", status)
        if !IsObject(this.Window)
            return
        this.Window.RestoreAfterScreenshot(previous)
        switch status {
            case "clipboard-busy":
                this.Window.SetStatus("Screenshot could not access the clipboard; try again")
                try TrayTip("Screenshot was not copied. Try again in a moment.",
                    "Olio Launcher", 0x2)
            case "capture-failed", "overlay-failed", "selection-failed":
                this.Window.SetStatus("Screenshot stopped safely; no clipboard change was made")
                try TrayTip("Screenshot stopped safely. Please try again.",
                    "Olio Launcher", 0x2)
            case "invalid-selection":
                try TrayTip("Drag to select a non-empty area.", "Olio Launcher", 0x1)
        }
    }

    static ConfigureTray() {
        A_IconTip := "Olio Launcher"
        try {
            if A_IsCompiled
                TraySetIcon(A_ScriptFullPath, 1)
            else
                TraySetIcon(LauncherWindow.BrandIconPath())
        }
        A_TrayMenu.Delete()
        A_TrayMenu.Add("Open / Hide", (*) => this.ImmediateToggle())
        A_TrayMenu.Add()
        A_TrayMenu.Add("Exit", (*) => this.Shutdown())
        A_TrayMenu.Default := "Open / Hide"
    }

    static ApplySettings(action, changes) {
        previous := this.Settings
        candidate := Map()
        if action = "reset" {
            candidate := SettingsManager.Defaults()
            for key in ["deviceId", "deviceName", "connectedDeviceName", "connectedAt"] {
                if previous.Has(key)
                    candidate[key] := previous[key]
            }
        } else {
            for key, value in previous
                candidate[key] := value
            for key, value in changes
                candidate[key] := value
        }

        SettingsManager.Warnings := []
        candidate := SettingsManager.Validate(candidate)
        hotkeyValidation := HotkeyManager.Validate(candidate["focusKey"])
        if !hotkeyValidation.Ok
            return {Ok: false,
                Message: "The Focus Key is invalid, reserved, or unavailable."}

        focusChanged := candidate["focusKey"] != previous["focusKey"]
        startupChanged := candidate["startWithWindows"] != previous["startWithWindows"]
        if focusChanged {
            registered := HotkeyManager.Register(candidate["focusKey"],
                this.FocusCallback, this.FocusReleaseCallback)
            if !registered.Ok {
                HotkeyManager.Register(previous["focusKey"],
                    this.FocusCallback, this.FocusReleaseCallback)
                return {Ok: false,
                    Message: "The Focus Key is invalid, reserved, or unavailable."}
            }
        }
        if startupChanged {
            startup := StartupManager.Apply(candidate["startWithWindows"])
            if !startup.Ok {
                if focusChanged
                    HotkeyManager.Register(previous["focusKey"],
                        this.FocusCallback, this.FocusReleaseCallback)
                return {Ok: false,
                    Message: "Start with Windows could not be changed. Nothing was saved."}
            }
        }

        changesToSave := Map()
        for key, value in candidate
            changesToSave[key] := value
        try values := SettingsManager.UpdateMany(changesToSave)
        catch {
            if startupChanged
                StartupManager.Apply(previous["startWithWindows"])
            if focusChanged
                HotkeyManager.Register(previous["focusKey"],
                    this.FocusCallback, this.FocusReleaseCallback)
            return {Ok: false, Message: "Settings could not be saved. Nothing changed."}
        }
        this.Settings := values
        RedactedLogger.Configure(values["loggingEnabled"])
        RedactedLogger.Write(action = "reset" ? "settings-reset" : "settings-save", "ok")
        return {Ok: true, Values: values}
    }

    static Shutdown(*) {
        RedactedLogger.Write("app-stop", "user")
        this.CancelPendingFocusToggle(true)
        if IsObject(this.Screenshot)
            this.Screenshot.Shutdown(false)
        if IsObject(this.QuickPastes)
            this.QuickPastes.Shutdown()
        if IsObject(this.Calendar)
            this.Calendar.Shutdown()
        if IsObject(this.CalendarRefreshCallback)
            try SetTimer(this.CalendarRefreshCallback, 0)
        if IsObject(this.Clipboard)
            this.Clipboard.Shutdown()
        if IsObject(this.Connection)
            this.Connection.Shutdown()
        HotkeyManager.Unregister()
        ExitApp(0)
    }
}
