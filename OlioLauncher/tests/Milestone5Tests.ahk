#Requires AutoHotkey v2.0.26
#SingleInstance Off
#Warn All, StdOut

#Include ..\src\FlatJson.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
#Include ..\src\HotkeyManager.ahk
#Include ..\src\CryptoRandom.ahk
#Include ..\src\CredentialStore.ahk
#Include ..\src\LauncherConnection.ahk
#Include ..\src\WindowsInterop.ahk
#Include ..\src\Navigation.ahk
#Include ..\src\TileRenderer.ahk
#Include ..\src\ClipboardRenderer.ahk
#Include ..\src\QuickPastesRenderer.ahk
#Include ..\src\CalendarRenderer.ahk
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\ScreenshotManager.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk

class M5MockCredentialStore {
    Value := ""
    Writes := 0
    Deletes := 0
    Read() => this.Value
    Write(value) {
        this.Writes += 1
        this.Value := value
        return true
    }
    Delete() {
        this.Deletes += 1
        this.Value := ""
        return true
    }
}

class M5MockTransport {
    Calls := []
    Cancelled := false
    Post(url, json, callback) {
        this.Calls.Push({Url: url, Json: json, Callback: callback})
        return true
    }
    Resolve(data, status := 200, ok := true) {
        call := this.Calls.RemoveAt(1)
        call.Callback.Call({Ok: ok, Status: status, Data: data})
    }
    Cancel() => this.Cancelled := true
}

class M5MockBrowser {
    Urls := []
    Call(url) => this.Urls.Push(url)
}

class Milestone5Tests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static Settings() {
        settings := SettingsManager.Defaults()
        settings["deviceId"] := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
        settings["deviceName"] := "Isolated Test Launcher"
        settings["workstationUrl"] := "https://workstation.example.com"
        return settings
    }

    static Run() {
        if A_Args.Length >= 2 && A_Args[1] = "--credential-read" {
            value := CredentialStore(A_Args[2]).Read()
            ExitApp(RegExMatch(value, "i)^[0-9a-f]{64}$") ? 0 : 1)
        }

        testDir := (A_Temp "\OlioLauncher-M5-" DllCall("GetCurrentProcessId", "uint")
            . "-" A_TickCount)
        originalDir := SettingsManager.SettingsDir
        originalPath := SettingsManager.SettingsPath
        originalValues := SettingsManager.Values
        try {
            SettingsManager.SettingsDir := testDir
            SettingsManager.SettingsPath := testDir "\settings.json"
            settings := this.Settings()
            SettingsManager.Values := settings

            this.TestCryptography()
            this.TestFontInterop()
            this.TestEndpointValidation()
            this.TestPairingAndExchange(settings)
            this.TestTerminalAndRecoveryStates()
            this.TestCredentialStoreRestart()
            this.TestNativeSettings(settings)
            this.TestPrivacy(testDir)
        } finally {
            SettingsManager.SettingsDir := originalDir
            SettingsManager.SettingsPath := originalPath
            SettingsManager.Values := originalValues
            if InStr(testDir, A_Temp "\OlioLauncher-M5-") = 1
                try DirDelete(testDir, true)
        }
        FileAppend("MILESTONE5_TEST`tPASS`t" this.Passed " assertions`n", "*", "UTF-8")
        ExitApp(0)
    }

    static TestCryptography() {
        secrets := Map()
        loop 128 {
            secret := CryptoRandom.Hex(32)
            this.Assert(RegExMatch(secret, "^[0-9a-f]{64}$"),
                "CNG secret format is invalid.")
            secrets[secret] := true
        }
        this.Assert(secrets.Count = 128, "CNG generated a duplicate in the test sample.")
        guid := CryptoRandom.Guid()
        this.Assert(RegExMatch(guid,
            "i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"),
            "CNG device identifier is not an RFC 4122 version-4 UUID.")
    }

    static TestFontInterop() {
        loop 64 {
            screenshotFont := ScreenshotManager.CreateFont(10, 600, 96)
            tileFont := TileRenderer.CreateFont(10, 600, 96)
            this.Assert(screenshotFont != 0 && tileFont != 0,
                "Win32 font creation returned a null handle.")
            this.Assert(DllCall("DeleteObject", "ptr", screenshotFont),
                "Screenshot font handle could not be deleted.")
            this.Assert(DllCall("DeleteObject", "ptr", tileFont),
                "Tile font handle could not be deleted.")
        }
    }

    static TestEndpointValidation() {
        productionSettings := SettingsManager.Defaults()
        productionManager := LauncherConnection(productionSettings, 0,
            M5MockCredentialStore(), M5MockTransport(), M5MockBrowser())
        this.Assert(productionManager.Origin = "https://olio.one",
            "A normal launcher does not automatically use the Olio Workstation origin.")
        this.Assert(!productionSettings.Has("workstationUrl"),
            "The production Workstation origin remains a user-managed setting.")
        productionManager.Shutdown()
        this.Assert(LauncherEndpoint.Normalize("https://Workstation.Example.com/")
            = "https://workstation.example.com", "HTTPS origin normalization failed.")
        for invalid in ["http://workstation.example.com", "https://user@workstation.example.com",
            "https://workstation.example.com/path", "https://localhost", "file:///test"]
            this.Assert(LauncherEndpoint.Normalize(invalid) = "", "Unsafe origin was accepted.")
        url := LauncherEndpoint.ApprovalUrl("https://workstation.example.com",
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "23456-789AB")
        this.Assert(url = "https://workstation.example.com/launcher/authorize?request="
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1&code=23456-789AB",
            "Approval URL is not fixed to the configured origin and path.")
        this.Assert(!InStr(url, "credential") && !InStr(url, "secret"),
            "Approval URL contains a forbidden secret field.")
    }

    static TestPairingAndExchange(settings) {
        store := M5MockCredentialStore(), transport := M5MockTransport()
        browser := M5MockBrowser()
        manager := LauncherConnection(settings, 0, store, transport, browser)
        startedAt := A_TickCount
        this.Assert(manager.StartPairing(), "Pairing did not start.")
        this.Assert(A_TickCount - startedAt < 100, "Pairing start blocked the launcher UI.")
        this.Assert(manager.State = "starting", "Pairing did not enter starting state.")
        this.Assert(transport.Calls.Length = 1, "Create request was not queued asynchronously.")
        createBody := FlatJson.Parse(transport.Calls[1].Json)
        pairingSecret := createBody["pairing_secret"]
        this.Assert(RegExMatch(pairingSecret, "^[0-9a-f]{64}$"),
            "Pairing request did not use a 256-bit CNG secret.")
        transport.Resolve(Map(
            "state", "waiting",
            "request_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
            "display_code", "23456-789AB",
            "expires_at", "2026-07-15T23:59:59Z",
            "poll_interval", 3
        ))
        manager.StopPolling()
        this.Assert(manager.State = "waiting", "Create response did not enter waiting state.")
        this.Assert(browser.Urls.Length = 1, "Normal browser was not requested exactly once.")
        this.Assert(!InStr(browser.Urls[1], pairingSecret), "Pairing secret entered the browser URL.")
        this.Assert(InStr(browser.Urls[1], "23456-789AB"), "Display code is missing from approval URL.")

        manager.Poll()
        this.Assert(transport.Calls.Length = 1, "Bounded poll was not queued.")
        transport.Resolve(Map("state", "approved"))
        this.Assert(manager.State = "exchanging", "Approval did not begin one-time exchange.")
        this.Assert(transport.Calls.Length = 1, "Exchange was not queued exactly once.")
        credential := CryptoRandom.Hex(32)
        transport.Resolve(Map("state", "connected", "credential", credential,
            "device_record_id", "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
            "device_name", "Isolated Test Launcher"))
        this.Assert(manager.State = "connected", "Successful exchange did not connect.")
        this.Assert(store.Writes = 1 && store.Value = credential,
            "Credential was not written once to the protected store.")
        this.Assert(manager.PairingSecret = "" && manager.RequestId = "",
            "One-time pairing material survived exchange.")
        saved := FileRead(SettingsManager.SettingsPath, "UTF-8")
        this.Assert(!InStr(saved, credential) && !InStr(saved, pairingSecret),
            "A secret entered settings.json.")

        manager.Disconnect()
        this.Assert(transport.Calls.Length = 1, "Disconnect did not request server revocation.")
        transport.Resolve(Map("state", "disconnected"))
        this.Assert(manager.State = "disconnected" && store.Deletes = 1 && store.Value = "",
            "Confirmed disconnect did not revoke and delete the credential.")
        manager.Shutdown()
    }

    static TestTerminalAndRecoveryStates() {
        for terminal in ["denied", "expired", "cancelled"] {
            settings := this.Settings(), transport := M5MockTransport()
            manager := LauncherConnection(settings, 0, M5MockCredentialStore(), transport,
                M5MockBrowser())
            manager.StartPairing()
            transport.Resolve(Map("state", "waiting",
                "request_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
                "display_code", "23456-789AB", "expires_at", "future"))
            manager.StopPolling(), manager.Poll()
            transport.Resolve(Map("state", terminal))
            this.Assert(manager.State = terminal, "Terminal pairing state was not handled.")
            this.Assert(manager.PairingSecret = "", "Terminal state retained pairing material.")
            manager.Shutdown()
        }

        settings := this.Settings(), transport := M5MockTransport(), store := M5MockCredentialStore()
        store.Value := CryptoRandom.Hex(32)
        manager := LauncherConnection(settings, 0, store, transport, M5MockBrowser())
        manager.RefreshStatus()
        transport.Resolve(Map("state", "invalid"), 401, false)
        this.Assert(manager.State = "revoked" && store.Value = "" && store.Deletes = 1,
            "Revoked device did not return to recoverable state and delete local credential.")

        store.Value := CryptoRandom.Hex(32)
        manager.Credential := store.Value
        manager.State := "connected"
        manager.RefreshStatus()
        transport.Resolve(0, 0, false)
        this.Assert(manager.State = "offline" && store.Value != "",
            "Recoverable network failure incorrectly deleted the credential.")
        manager.Shutdown()

        settings := this.Settings(), transport := M5MockTransport()
        manager := LauncherConnection(settings, 0, M5MockCredentialStore(), transport,
            M5MockBrowser())
        manager.StartPairing()
        transport.Resolve(Map("state", "waiting",
            "request_id", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
            "display_code", "23456-789AB", "expires_at", "future"))
        manager.StopPolling(), manager.Poll()
        originalSecret := manager.PairingSecret
        transport.Resolve(0, 0, false)
        this.Assert(manager.State = "offline" && manager.RequestId,
            "Offline approval recovery discarded the pending request.")
        this.Assert(manager.Retry() && manager.PairingSecret = originalSecret,
            "Retry created a second request instead of resuming the existing request.")
        transport.Resolve(Map("state", "waiting"))
        manager.StopPolling(), manager.Shutdown()

        settings := this.Settings(), transport := M5MockTransport(), store := M5MockCredentialStore()
        store.Value := CryptoRandom.Hex(32)
        manager := LauncherConnection(settings, 0, store, transport, M5MockBrowser())
        manager.Disconnect()
        transport.Resolve(Map("state", "invalid"))
        this.Assert(manager.State = "disconnected" && store.Value = "",
            "Disconnect did not clear a credential already revoked on the server.")
        manager.Shutdown()

        settings := this.Settings(), transport := M5MockTransport()
        manager := LauncherConnection(settings, 0, M5MockCredentialStore(), transport,
            M5MockBrowser())
        manager.StartPairing()
        transport.Resolve(Map("state", "invalid"), 400, false)
        this.Assert(manager.State = "error" && InStr(manager.Detail, "not ready"),
            "Missing server setup was mislabeled as a network outage.")
        manager.Shutdown()
    }

    static TestCredentialStoreRestart() {
        defaultSettings := this.Settings()
        defaultSettings["deviceId"] := CryptoRandom.Guid()
        defaultManager := LauncherConnection(defaultSettings)
        this.Assert(defaultManager.CredentialStore.Target
            = "OlioLauncher.DeviceCredential.v1." defaultSettings["deviceId"],
            "Default startup did not construct the device-specific credential store.")
        defaultManager.Shutdown()

        suffix := ".Test." DllCall("GetCurrentProcessId", "uint") "." A_TickCount
        store := CredentialStore(suffix)
        credential := CryptoRandom.Hex(32)
        try {
            this.Assert(store.Write(credential), "Windows Credential Manager write failed.")
            this.Assert(store.Read() = credential, "Windows Credential Manager read failed.")
            command := (Chr(34) A_AhkPath Chr(34) " /ErrorStdOut " Chr(34)
                . A_ScriptFullPath Chr(34) " --credential-read " Chr(34) suffix Chr(34))
            exitCode := RunWait(command, A_ScriptDir, "Hide")
            this.Assert(exitCode = 0, "Protected credential did not survive an isolated process restart.")
            this.Assert(store.Delete(), "Windows Credential Manager delete failed.")
            this.Assert(store.Read() = "", "Deleted credential remained readable.")
        } finally store.Delete()
    }

    static TestNativeSettings(settings) {
        manager := LauncherConnection(settings, 0, M5MockCredentialStore(),
            M5MockTransport(), M5MockBrowser())
        window := LauncherWindow(settings, (*) => 0, true, 0, manager)
        try {
            window.OpenPreferences()
            this.Assert(IsObject(window.SettingsDialog),
                "Launcher did not open the standalone Settings window.")
            window.SettingsDialog.ShowSection("account")
            this.Assert(window.SettingsDialog.DeviceNameEdit.Visible,
                "Native Settings device-name field is not visible.")
            this.Assert(window.SettingsDialog.ConnectButton.Visible,
                "Disconnected Settings state has no Connect action.")
            this.Assert(SettingsRenderer.Items[window.SettingsDialog.ConnectButton.Hwnd].Title
                = "Connect Olio account",
                "Connect action lacks an accessible native label.")
            this.Assert(window.Buttons["calendar"].Enabled
                && window.Buttons["networkAnalyzer"].Enabled = false,
                "Calendar or deferred Network tile state is incorrect.")
            source := FileRead(A_ScriptDir "\..\src\LauncherWindow.ahk", "UTF-8")
            this.Assert(!InStr(source, "ConnectionEndpointEdit")
                && !InStr(source, "Olio Workstation HTTPS address"),
                "Native Settings still asks the user to configure the product endpoint.")
            this.Assert(InStr(source, "Disconnect this Olio Launcher?")
                && InStr(source, "YesNo Icon! Default2"),
                "Disconnect does not require an explicit default-cancel confirmation.")
        } finally {
            window.CloseSettingsDialog()
            manager.Shutdown()
            window.Gui.Destroy()
        }
    }

    static TestPrivacy(testDir) {
        connectionSource := FileRead(A_ScriptDir "\..\src\LauncherConnection.ahk", "UTF-8")
        this.Assert(!InStr(connectionSource, "RedactedLogger.Write"),
            "Connection code could log request or response material.")
        this.Assert(InStr(connectionSource, "request.Option[6] := false"),
            "HTTP redirects are not explicitly disabled for authenticated requests.")
        this.Assert(InStr(connectionSource, "CredentialStore(" Chr(34) "." Chr(34)
            " this.Settings[" Chr(34) "deviceId" Chr(34) "])"),
            "Protected credential target is not isolated by launcher device identity.")
        restartSource := FileRead(A_ScriptDir "\..\Run-OlioLauncher.cmd", "UTF-8")
        this.Assert(InStr(restartSource, "OlioLauncher.ahk")
            && InStr(restartSource, "OlioLauncher.exe"),
            "Restart script does not target both supported launcher forms.")
        this.Assert(!RegExMatch(restartSource, "i)taskkill.+AutoHotkey|Stop-Process.+-Name"),
            "Restart script could terminate unrelated AutoHotkey processes.")
        this.Assert(!RegExMatch(connectionSource, "i)QuickPastesClient|quick_pastes|offline.?cache|SendToPhone|NetworkAnalyzer"),
            "A later-milestone data path entered the launcher connection module.")
        this.Assert(!InStr(connectionSource, "http://"), "Launcher connection code permits cleartext HTTP.")
        if DirExist(testDir) {
            for filePath in [SettingsManager.SettingsPath] {
                if FileExist(filePath)
                    this.Assert(!RegExMatch(FileRead(filePath, "UTF-8"), "i)[0-9a-f]{64}"),
                        "A credential-shaped secret entered a test artifact.")
            }
        }
    }
}

try Milestone5Tests.Run()
catch as testError {
    FileAppend("MILESTONE5_TEST`tFAIL`tline=" testError.Line " "
        RegExReplace(testError.Message, "[\r\n\t]", " ") "`n", "*", "UTF-8")
    ExitApp(1)
}
