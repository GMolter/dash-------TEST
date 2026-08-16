#Requires AutoHotkey v2.0.26
#SingleInstance Off
#Warn All, StdOut
Persistent

DllCall("SetProcessDpiAwarenessContext", "ptr", -4, "ptr") ; PER_MONITOR_AWARE_V2

#Include ..\src\FlatJson.ahk
#Include ..\src\Logging.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
#Include ..\src\CryptoRandom.ahk
#Include ..\src\CredentialStore.ahk
#Include ..\src\LauncherConnection.ahk
#Include ..\src\QuickPastesClient.ahk
#Include ..\src\WindowsInterop.ahk
#Include ..\src\InstanceCoordinator.ahk
#Include ..\src\HotkeyManager.ahk
#Include ..\src\FocusKeyGesture.ahk
#Include ..\src\StartupManager.ahk
#Include ..\src\ClipboardManager.ahk
#Include ..\src\ScreenshotManager.ahk
#Include ..\src\Navigation.ahk
#Include ..\src\TileRenderer.ahk
#Include ..\src\ClipboardRenderer.ahk
#Include ..\src\QuickPastesRenderer.ahk
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk
#Include ..\src\App.ahk
#Include NativeLauncherPocWindow.ahk

class NativeLauncherPocApp extends OlioApp {
    static Start(visualTestMode := false) {
        activation := (*) => this.OnSecondaryActivation()
        namespace := visualTestMode
            ? ".NativeSettingsPoc.VisualTest" : ".NativeSettingsPoc"
        if !InstanceCoordinator.BecomePrimary(activation, namespace)
            ExitApp(0)

        ; The POC deliberately shares the production profile and credential.
        this.Settings := SettingsManager.Load()
        RedactedLogger.Configure(this.Settings["loggingEnabled"])
        RedactedLogger.Write("app-start", "primary")
        for warning in SettingsManager.Warnings
            RedactedLogger.Write("settings-warning", warning)

        ; Startup remains owned by the production launcher command.
        startup := visualTestMode
            ? {Ok: true, Status: "visual-test-no-startup-change"}
            : this.ApplyProductionStartup(this.Settings["startWithWindows"])
        RedactedLogger.Write("startup-registration", startup.Status)

        this.Clipboard := ClipboardManager(this.Settings)
        this.Connection := visualTestMode ? 0 : LauncherConnection(this.Settings)
        this.QuickPastes := IsObject(this.Connection)
            ? QuickPastesClient(this.Connection) : 0
        this.Screenshot := ScreenshotManager(this.Clipboard,
            (status, previous, result) => this.OnScreenshotFinished(status, previous, result))
        this.Window := NativeLauncherPocWindow(this.Settings,
            (key) => this.OnNavigate(key), visualTestMode, this.Clipboard, this.Connection,
            this.QuickPastes, (action, changes) => this.ApplySettings(action, changes))

        if IsObject(this.Connection) {
            this.Connection.ChangedCallback := (state, detail) =>
                this.OnConnectionChanged(state, detail)
            this.Connection.CredentialClearedCallback := (reason) =>
                this.QuickPastes.Clear(reason = "revoked" ? "revoked" : "disconnected",
                    reason = "revoked"
                        ? "This launcher was revoked. Connect again in Settings."
                        : "Connect an Olio account in Settings.")
        }
        if IsObject(this.QuickPastes)
            this.QuickPastes.ChangedCallback := (state, detail) =>
                this.Window.OnQuickPastesChanged(state, detail)
        this.Clipboard.ChangedCallback := (status) =>
            this.Window.OnClipboardHistoryChanged(status)
        this.Clipboard.Start()

        this.OwnsFocusKey := !visualTestMode
        this.FocusGesture := 0
        this.FocusCallback := 0
        this.FocusReleaseCallback := 0
        this.PendingFocusToggleCallback := 0
        if this.OwnsFocusKey {
            ; The POC runner closes production first, so this process becomes the one
            ; intentional owner of the shared Focus Key.
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
                    hotkeyResult := {Ok: true,
                        Status: "Configured Focus Key failed; using #+F23"}
            }
            this.Window.SetStatus(hotkeyResult.Status)
            RedactedLogger.Write("focus-key-registration",
                hotkeyResult.Ok ? "ok" : "error")
        }
        this.ConfigureTray()
        this.Window.Show()
    }

    static ConfigureTray() {
        A_IconTip := "Olio Launcher - Native POC"
        try TraySetIcon(LauncherWindow.BrandIconPath())
        A_TrayMenu.Delete()
        A_TrayMenu.Add("Open / Hide POC", (*) => this.ImmediateToggle())
        A_TrayMenu.Add()
        A_TrayMenu.Add("Exit POC", (*) => this.Shutdown())
        A_TrayMenu.Default := "Open / Hide POC"
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
        if focusChanged && this.OwnsFocusKey {
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
            startup := this.ApplyProductionStartup(candidate["startWithWindows"])
            if !startup.Ok {
                if focusChanged && this.OwnsFocusKey
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
                this.ApplyProductionStartup(previous["startWithWindows"])
            if focusChanged && this.OwnsFocusKey
                HotkeyManager.Register(previous["focusKey"],
                    this.FocusCallback, this.FocusReleaseCallback)
            return {Ok: false, Message: "Settings could not be saved. Nothing changed."}
        }
        this.Settings := values
        RedactedLogger.Configure(values["loggingEnabled"])
        RedactedLogger.Write(action = "reset" ? "settings-reset" : "settings-save", "ok")
        return {Ok: true, Values: values}
    }

    static ApplyProductionStartup(enabled) {
        try {
            if enabled {
                productionScript := this.ProductionScriptPath()
                command := Chr(34) A_AhkPath Chr(34) " " Chr(34)
                    productionScript Chr(34) " --background"
                current := ""
                try current := RegRead(StartupManager.RegistryPath,
                    StartupManager.ValueName)
                if current != command
                    RegWrite(command, "REG_SZ", StartupManager.RegistryPath,
                        StartupManager.ValueName)
                return {Ok: true, Status: "startup-enabled"}
            }
            try RegDelete(StartupManager.RegistryPath, StartupManager.ValueName)
            return {Ok: true, Status: "startup-disabled"}
        } catch {
            return {Ok: false, Status: "startup-error"}
        }
    }

    static ProductionScriptPath() {
        candidate := A_ScriptDir "\..\OlioLauncher.ahk"
        fullPathBuffer := Buffer(32768 * 2, 0)
        length := DllCall("GetFullPathNameW", "str", candidate, "uint", 32768,
            "ptr", fullPathBuffer, "ptr", 0, "uint")
        return length && length < 32768
            ? StrGet(fullPathBuffer, length, "UTF-16") : candidate
    }

    static Shutdown(*) {
        RedactedLogger.Write("app-stop", "user")
        this.CancelPendingFocusToggle(true)
        if IsObject(this.Screenshot)
            this.Screenshot.Shutdown(false)
        if IsObject(this.QuickPastes)
            this.QuickPastes.Shutdown()
        if IsObject(this.Clipboard)
            this.Clipboard.Shutdown()
        if IsObject(this.Connection)
            this.Connection.Shutdown()
        HotkeyManager.Unregister()
        ExitApp(0)
    }
}

if A_Args.Length && A_Args[1] = "--syntax-check"
    ExitApp(0)

NativeLauncherPocApp.Start(A_Args.Length && A_Args[1] = "--visual-test")
