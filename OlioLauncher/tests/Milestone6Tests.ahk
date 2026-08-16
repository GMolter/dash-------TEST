#Requires AutoHotkey v2.0.26
#SingleInstance Off
#Warn All, StdOut

DllCall("SetProcessDpiAwarenessContext", "ptr", -4, "ptr")

#Include ..\src\FlatJson.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
#Include ..\src\HotkeyManager.ahk
#Include ..\src\CryptoRandom.ahk
#Include ..\src\CredentialStore.ahk
#Include ..\src\LauncherConnection.ahk
#Include ..\src\QuickPastesClient.ahk
#Include ..\src\WindowsInterop.ahk
#Include ..\src\Navigation.ahk
#Include ..\src\TileRenderer.ahk
#Include ..\src\ClipboardRenderer.ahk
#Include ..\src\QuickPastesRenderer.ahk
#Include ..\src\CalendarRenderer.ahk
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk

class M6MockTransport {
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

class M6MockConnection {
    __New() {
        this.Settings := Map(
            "deviceId", "aaaaaaaa-0000-4000-8000-000000000001")
        this.Origin := "https://workstation.example.com"
        this.Credential :=
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        this.Invalidations := 0
    }

    Serialize(values) {
        result := "{", first := true
        for key, value in values {
            result .= (first ? "" : ",") FlatJson.Quote(key) ":"
                . FlatJson.Quote(String(value))
            first := false
        }
        return result "}"
    }

    InvalidateCredential(*) {
        this.Invalidations += 1
        this.Credential := ""
    }
}

class M6MockClipboard {
    __New() {
        this.Entries := []
        this.Paused := true
        this.Published := []
    }

    PublishText(value) {
        this.Published.Push(value)
        return true
    }

    ReleasePreviews() {
    }
}

class Milestone6Tests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static Item(idSuffix, title, content, category := "", sortOrder := 0,
        favorite := false) {
        return Map(
            "id", "aaaaaaaa-aaaa-4aaa-8aaa-" Format("{:012}", idSuffix),
            "title", title,
            "content", content,
            "category", category,
            "sort_order", sortOrder,
            "is_favorite", favorite
        )
    }

    static Success(items) {
        return Map(
            "state", "connected",
            "synchronized_at", "2026-07-17T12:34:56.000Z",
            "items", items
        )
    }

    static MakeClient(&connection, &transport) {
        connection := M6MockConnection()
        transport := M6MockTransport()
        return QuickPastesClient(connection, 0, transport)
    }

    static Run() {
        this.TestNestedJson()
        this.TestFetchSearchCategoriesFavoritesAndOrder()
        this.TestEmptyManualRefreshAndResponsiveness()
        this.TestRecoverableFailuresAndValidation()
        this.TestRevocationDisconnectAndExit()
        this.TestNativeUiCopyPasteAndAccessibility()
        this.TestPrivacyContracts()
        FileAppend("MILESTONE6_TEST`tPASS`t" this.Passed
            " assertions`n", "*", "UTF-8")
        ExitApp(0)
    }

    static TestNestedJson() {
        parsed := FlatJson.Parse(
            '{"state":"connected","items":[{"id":"x","favorite":true,"category":null}]}')
        this.Assert(parsed is Map && parsed["items"] is Array,
            "Nested API JSON did not parse as an object and array.")
        this.Assert(parsed["items"][1]["favorite"] = true
            && parsed["items"][1]["category"] = "",
            "Nested Boolean or null JSON parsing failed.")
        rejected := false
        try FlatJson.Parse('{"items":[1,]}')
        catch
            rejected := true
        this.Assert(rejected, "Malformed nested JSON was accepted.")
    }

    static TestFetchSearchCategoriesFavoritesAndOrder() {
        client := this.MakeClient(&connection, &transport)
        started := A_TickCount
        this.Assert(client.Refresh(), "Connected synchronization did not start.")
        this.Assert(A_TickCount - started < 100,
            "Synchronization start blocked the launcher thread.")
        this.Assert(client.State = "syncing" && transport.Calls.Length = 1,
            "Connected synchronization did not expose its loading state.")
        request := FlatJson.Parse(transport.Calls[1].Json)
        this.Assert(request["action"] = "quick-pastes",
            "Quick Paste synchronization did not use the narrow endpoint action.")
        this.Assert(request["device_id"] = connection.Settings["deviceId"]
            && request["credential"] = connection.Credential,
            "Device authentication did not bind identifier and credential.")
        this.Assert(!request.Has("user_id") && !request.Has("owner_id")
            && !request.Has("email"),
            "A launcher ownership value entered the device request.")

        items := [
            this.Item(1, "Alpha", "First harmless fixture", "General", 0, true),
            this.Item(2, "Beta", "Second harmless fixture", "Support", 1, false),
            this.Item(3, "Gamma", "Third harmless fixture", "General", 2, true)
        ]
        this.Assert(RegExMatch(items[1]["id"],
            "i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"),
            "Synthetic item identifier is malformed.")
        this.Assert(Type(items[1]["is_favorite"]) = "Integer"
            && Type(items[1]["sort_order"]) = "Integer",
            "Synthetic Boolean or sort-order types are malformed.")
        this.Assert(IsObject(client.ParseResponse(this.Success(items))),
            "Valid bounded response was rejected by the client validator; field="
                client.LastValidationFailure ".")
        transport.Resolve(this.Success(items))
        this.Assert(client.State = "ready" && client.Items.Length = 3,
            "Connected fetch success did not replace the in-memory collection; state="
                client.State ";count=" client.Items.Length ".")
        this.Assert(client.Items[1].Title = "Alpha"
            && client.Items[3].Title = "Gamma",
            "Stable server ordering was not preserved.")
        this.Assert(client.Filter("second", "", false).Length = 1
            && client.Filter("beta", "", false)[1].Title = "Beta",
            "Search did not cover content and title.")
        this.Assert(client.Filter("", "General", false).Length = 2,
            "Category filtering returned the wrong rows.")
        this.Assert(client.Filter("", "", true).Length = 2,
            "Favorites filtering returned the wrong rows.")
        this.Assert(client.Filter("favorite").Length = 2,
            "Favorites were not searchable through the common search field.")
        visible := client.Filter()
        this.Assert(visible[1].Title = "Alpha" && visible[2].Title = "Gamma"
            && visible[3].Title = "Beta",
            "Favorites were not grouped first while preserving stable group order.")
        categories := client.Categories()
        this.Assert(categories.Length = 2 && categories[1] = "General"
            && categories[2] = "Support",
            "Categories are not unique and stably sorted.")
        this.Assert(client.LastSuccessfulAt
            && InStr(client.LastSyncDisplay(), "Last synchronized"),
            "Last successful synchronization time was not retained in memory.")
        client.Shutdown()
    }

    static TestEmptyManualRefreshAndResponsiveness() {
        client := this.MakeClient(&connection, &transport)
        this.Assert(client.Refresh(), "Empty-collection refresh did not start.")
        transport.Resolve(this.Success([]))
        this.Assert(client.State = "empty" && client.Items.Length = 0,
            "A safe empty collection did not enter the empty state.")
        this.Assert(client.Refresh() && transport.Calls.Length = 1,
            "Manual refresh did not queue another request.")
        this.Assert(!client.Refresh(),
            "A second request was allowed while synchronization was in flight.")
        transport.Resolve(this.Success([]))
        client.Shutdown()
    }

    static TestRecoverableFailuresAndValidation() {
        client := this.MakeClient(&connection, &transport)
        client.Refresh()
        transport.Resolve(this.Success([
            this.Item(1, "Retained", "Harmless retained fixture", "General")
        ]))
        retained := client.Items[1]

        client.Refresh()
        transport.Resolve(0, 0, false)
        this.Assert(client.State = "offline" && client.Items.Length = 1
            && InStr(client.Detail, "last in-memory"),
            "Offline failure did not retain and clearly label the in-memory list.")

        client.Refresh()
        transport.Resolve(Map("state", "invalid"), 400, false)
        this.Assert(client.State = "not-ready"
            && InStr(client.Detail, "not available"),
            "An undeployed Quick Paste backend did not produce a clear recovery state.")

        malformed := this.Success([
            this.Item(2, "Out of order", "Harmless fixture", "", 2),
            this.Item(3, "Backwards", "Harmless fixture", "", 1)
        ])
        client.Refresh(), transport.Resolve(malformed)
        this.Assert(client.State = "invalid-response"
            && client.Items[1] = retained,
            "Malformed response replaced the last valid in-memory collection.")

        oversizedItems := []
        loop QuickPastesClient.MaxItems + 1
            oversizedItems.Push(this.Item(A_Index, "Bounded", "Harmless fixture",
                "", A_Index - 1))
        client.Refresh(), transport.Resolve(this.Success(oversizedItems))
        this.Assert(client.State = "invalid-response"
            && client.Items.Length = 1,
            "Oversized item count was accepted or discarded the safe prior list.")

        hostile := this.Item(4, "<script>alert(1)</script>" Chr(1),
            "<b>literal</b>`nline", "Category" Chr(2), 0, false)
        client.Refresh(), transport.Resolve(this.Success([hostile]))
        this.Assert(client.State = "ready"
            && InStr(client.Items[1].SafeTitle(), "<script>")
            && InStr(client.Items[1].SafeTitle(), "�")
            && InStr(client.Items[1].SafeContent(), "<b>literal</b>"),
            "Hostile text was executed, lost, or rendered without control sanitization.")

        client.Refresh()
        transport.Resolve(Map("state", "rate_limited"), 429, false)
        this.Assert(client.State = "rate-limited" && client.Items.Length = 1,
            "Rate limiting was not recoverable.")
        client.Shutdown()
    }

    static TestRevocationDisconnectAndExit() {
        client := this.MakeClient(&connection, &transport)
        client.Refresh()
        transport.Resolve(this.Success([
            this.Item(1, "Revocation", "Harmless fixture")
        ]))
        released := client.Items[1]
        client.Refresh()
        transport.Resolve(Map("state", "invalid"), 401, false)
        this.Assert(client.State = "revoked",
            "Revocation did not enter the revoked state.")
        this.Assert(client.Items.Length = 0,
            "Revocation did not clear in-memory rows.")
        this.Assert(connection.Invalidations = 1,
            "Revocation did not invalidate the protected credential.")
        this.Assert(StrLen(connection.Credential) = 0,
            "Revocation retained a protected credential value.")
        this.Assert(released.Content = "",
            "Revocation retained Quick Paste content through an external reference.")

        client := this.MakeClient(&connection, &transport)
        client.Refresh()
        transport.Resolve(this.Success([
            this.Item(2, "Disconnect", "Harmless fixture")
        ]))
        released := client.Items[1]
        client.Clear("disconnected", "Disconnected.")
        this.Assert(client.Items.Length = 0 && !client.LastSuccessfulAt
            && released.Content = "",
            "Disconnect did not clear all in-memory Quick Paste data and sync metadata.")

        client.Refresh()
        transport.Resolve(this.Success([
            this.Item(3, "Exit", "Harmless fixture")
        ]))
        released := client.Items[1]
        client.Shutdown()
        this.Assert(client.Stopped && client.Items.Length = 0
            && released.Content = "",
            "Launcher exit did not clear all in-memory Quick Paste data.")

        client := this.MakeClient(&connection, &transport)
        client.Refresh()
        transport.Resolve(Map("state", "scope_required"), 403, false)
        this.Assert(client.State = "scope-required"
            && connection.Credential && connection.Invalidations = 0,
            "A legacy scope recovery incorrectly deleted a valid Milestone 5 credential.")
        client.Shutdown()
    }

    static TestNativeUiCopyPasteAndAccessibility() {
        settings := SettingsManager.Defaults()
        connection := M6MockConnection()
        transport := M6MockTransport()
        client := QuickPastesClient(connection, 0, transport)
        clipboard := M6MockClipboard()
        window := LauncherWindow(settings, (*) => 0, true,
            clipboard, connection, client)
        client.ChangedCallback := (state, detail) =>
            window.OnQuickPastesChanged(state, detail)
        try {
            window.Gui.Show("NA x-10000 y-10000 w360 h500")
            window.ShowPage("quickPastes")
            this.Assert(client.RequestBusy && transport.Calls.Length = 1,
                "Opening Quick Pastes did not start synchronization directly.")
            transport.Resolve(this.Success([
                this.Item(1, "Keyboard fixture", "Exact clipboard fixture",
                    "General", 0, true),
                this.Item(2, "Other fixture", "Other harmless fixture",
                    "Support", 1, false),
                this.Item(3, "Third fixture", "Third harmless fixture",
                    "", 2, false),
                this.Item(4, "Fourth fixture", "Fourth harmless fixture",
                    "", 3, false),
                this.Item(5, "Fifth fixture", "Fifth harmless fixture",
                    "", 4, false),
                this.Item(6, "Sixth fixture", "Sixth harmless fixture",
                    "", 5, false)
            ]))
            this.Assert(window.PageKey = "quickPastes"
                && window.QuickSearchEdit.Visible
                && !window.HasOwnProp("QuickCategoryList")
                && !window.HasOwnProp("QuickCategoryLabel"),
                "Native search is missing or the removed category selector remains.")
            this.Assert(window.QuickRefreshButton.Text = "Refresh"
                && window.QuickCopyButton.Text = "Copy"
                && window.QuickPasteButton.Text = "Paste"
                && window.QuickSettingsButton.Text = "Open Settings",
                "A Quick Paste action lacks an accessible native label.")
            this.Assert(window.QuickVisibleItems.Length = 6
                && DllCall("GetFocus", "ptr") = window.QuickPasteList.Hwnd,
                "Quick Paste list did not receive native keyboard focus.")
            listStyle := DllCall("GetWindowLongW", "ptr",
                window.QuickPasteList.Hwnd, "int", -16, "uint")
            this.Assert(listStyle & 0x10 && listStyle & 0x00200000,
                "Quick Paste list lacks owner-drawn cards or vertical navigation.")

            wheelDown := ((-120 & 0xFFFF) << 16)
            this.Assert(window.OnQuickPasteMouseWheel(wheelDown, 0, 0,
                window.QuickPasteList.Hwnd) = 0
                && DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                    "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") = 2,
                "A wheel notch did not move the Quick Paste list by two cards.")
            wheelUp := (120 << 16)
            this.Assert(window.OnQuickPasteMouseWheel(wheelUp, 0, 0,
                window.QuickPasteList.Hwnd) = 0
                && DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                    "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") = 0,
                "Reverse wheel movement did not return naturally toward the first card.")
            halfWheelDown := ((-60 & 0xFFFF) << 16)
            window.OnQuickPasteMouseWheel(halfWheelDown, 0, 0,
                window.QuickPasteList.Hwnd)
            this.Assert(DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") = 0,
                "A partial high-resolution wheel delta moved before one full notch.")
            window.OnQuickPasteMouseWheel(halfWheelDown, 0, 0,
                window.QuickPasteList.Hwnd)
            this.Assert(DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr") = 2,
                "Accumulated high-resolution wheel deltas did not scroll naturally.")
            DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                "uint", 0x0197, "uptr", 0, "ptr", 0)

            this.Assert(window.CopyQuickPasteSelection()
                && clipboard.Published.Length = 1
                && clipboard.Published[1] = "Exact clipboard fixture",
                "Copy did not place only the selected content on the clipboard boundary.")
            this.Assert(clipboard.Entries.Length = 0 && clipboard.Paused,
                "Quick Paste copy bypassed pause coherency or created a history duplicate.")
            this.Assert(window.QuickLastFeedback = "Copied selected Quick Paste.",
                "Copy did not provide clear feedback.")

            DllCall("SendMessageW", "ptr", window.QuickPasteList.Hwnd,
                "uint", 0x0186, "uptr", 1, "ptr", 0)
            firstItemPoint := (10 << 16) | 10
            window.OnListMouseUp(0, firstItemPoint, 0,
                window.QuickPasteList.Hwnd)
            this.Assert(window.SelectedQuickPasteIndex() = 1,
                "Mouse selection did not select the expected Quick Paste row.")
            this.Assert(clipboard.Published.Length = 2,
                "Mouse selection did not invoke the suppressed clipboard publication.")
            this.Assert(clipboard.Published[2] = "Exact clipboard fixture",
                "Mouse-selecting a Quick Paste did not automatically copy its exact content.")

            pasteTarget := 0
            window.PreviousForeground := 424242
            window.PasteRunner := (hwnd) => (pasteTarget := hwnd, false)
            this.Assert(!window.PasteQuickPasteSelection()
                && pasteTarget = 424242
                && clipboard.Published.Length = 3,
                "Explicit paste did not target only the previously active application.")
            this.Assert(InStr(window.QuickLastFeedback, "Paste manually"),
                "Safe paste failure did not leave recoverable feedback.")

            connection.Credential := ""
            client.Clear("disconnected", "Connect an Olio account in Settings.")
            window.ShowPage("quickPastes")
            this.Assert(window.QuickSettingsButton.Visible
                && window.QuickSettingsButton.Enabled
                && !window.QuickCopyButton.Enabled
                && !window.QuickPasteButton.Enabled,
                "Disconnected state lacks a Settings route or exposes content actions.")
            this.Assert(window.Buttons["calendar"].Enabled
                && !window.Buttons["networkAnalyzer"].Enabled,
                "Calendar or deferred Network tile state is incorrect.")
        } finally {
            client.ChangedCallback := 0
            try window.Gui.Destroy()
            client.Shutdown()
        }
    }

    static TestPrivacyContracts() {
        quickSource := FileRead(A_ScriptDir "\..\src\QuickPastesClient.ahk", "UTF-8")
        windowSource := FileRead(A_ScriptDir "\..\src\LauncherWindow.ahk", "UTF-8")
        connectionSource := FileRead(A_ScriptDir "\..\src\LauncherConnection.ahk", "UTF-8")
        this.Assert(!RegExMatch(quickSource,
            "i)(FileAppend|FileOpen|FileWrite|FileMove|FileCopy|DirCreate|"
            . "localStorage|sessionStorage|offline.?cache|RedactedLogger)"),
            "Quick Paste synchronization contains a persistence, cache, or logging sink.")
        this.Assert(!RegExMatch(quickSource, "i)(user_id|owner_id|email)"),
            "Launcher Quick Paste code accepts an ownership spoofing field.")
        this.Assert(InStr(windowSource, "ClipboardManager.PublishText")
            || InStr(windowSource, "this.ClipboardManager.PublishText"),
            "Quick Paste copy does not reuse the existing clipboard suppression path.")
        this.Assert(!RegExMatch(windowSource,
            "i)(__quick_(create|edit|delete|reorder|favorite)|QuickPasteEditor)"),
            "Workstation Quick Paste management entered the launcher.")
        this.Assert(!InStr(connectionSource, "RedactedLogger.Write"),
            "Authenticated launcher request code can log request or response material.")
        this.Assert(LauncherHttpTransport.MaxResponseCharacters = 1048576,
            "Launcher HTTPS response-size limit changed unexpectedly.")
    }
}

try Milestone6Tests.Run()
catch as testError {
    FileAppend("MILESTONE6_TEST`tFAIL`tline=" testError.Line " "
        SubStr(RegExReplace(testError.Message, "[\r\n\t]", " "), 1, 220)
        "`n", "*", "UTF-8")
    ExitApp(1)
}
