class LauncherCalendarEvent {
    __New(id, title, startAt, endAt, allDay, ongoing, location) {
        this.Id := id
        this.Title := title
        this.StartAt := startAt
        this.EndAt := endAt
        this.AllDay := allDay
        this.Ongoing := ongoing
        this.Location := location
    }

    SafeDisplay(value, maximum, fallback := "") {
        value := RegExReplace(String(value), "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "�")
        value := RegExReplace(value, "\R+", " ↵ ")
        value := Trim(value, " `t")
        if !value
            value := fallback
        return StrLen(value) > maximum ? SubStr(value, 1, maximum - 1) "…" : value
    }

    SafeTitle(maximum := 120) => this.SafeDisplay(this.Title, maximum, "(Untitled event)")
    SafeLocation(maximum := 100) => this.SafeDisplay(this.Location, maximum)

    static UtcStamp(value) {
        if !RegExMatch(value,
            "^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$", &match)
            return ""
        return match[1] match[2] match[3] match[4] match[5] match[6]
    }

    static LocalStamp(value) {
        utc := LauncherCalendarEvent.UtcStamp(value)
        if !utc
            return ""
        offset := DateDiff(A_Now, A_NowUTC, "Seconds")
        return DateAdd(utc, offset, "Seconds")
    }

    TimeText() {
        if this.AllDay
            return "All day"
        start := LauncherCalendarEvent.LocalStamp(this.StartAt)
        end := LauncherCalendarEvent.LocalStamp(this.EndAt)
        if !start || !end
            return "Time unavailable"
        return this.Ongoing
            ? "Now  •  until " FormatTime(end, "h:mm tt")
            : FormatTime(start, "h:mm tt") " – " FormatTime(end, "h:mm tt")
    }

    Release() {
        this.Id := ""
        this.Title := ""
        this.StartAt := ""
        this.EndAt := ""
        this.Location := ""
        this.AllDay := false
        this.Ongoing := false
    }
}

class CalendarClient {
    static MaxItems := 50

    __New(connectionManager, changedCallback := 0, transport := 0, cacheStore := 0) {
        this.ConnectionManager := connectionManager
        this.ChangedCallback := changedCallback
        this.Transport := IsObject(transport) ? transport : LauncherHttpTransport()
        this.CacheStore := IsObject(cacheStore) ? cacheStore : CalendarCacheStore()
        this.Items := []
        this.State := IsObject(connectionManager) && connectionManager.Credential
            ? "connected" : "disconnected"
        this.Detail := this.State = "connected"
            ? "Ready to load today's schedule."
            : "Connect an Olio account in Settings."
        this.LastSuccessfulAt := ""
        this.RequestBusy := false
        this.Stopped := false
        this.LoadCache()
    }

    static TimeWindow() {
        offset := DateDiff(A_Now, A_NowUTC, "Seconds")
        localEnd := FormatTime(, "yyyyMMdd") "235959"
        utcEnd := DateAdd(localEnd, -offset, "Seconds")
        return {
            Start: FormatTime(A_NowUTC, "yyyy-MM-dd'T'HH:mm:ss'Z'"),
            End: FormatTime(utcEnd, "yyyy-MM-dd'T'HH:mm:ss'Z'")
        }
    }

    Refresh() {
        if this.Stopped || this.RequestBusy
            return false
        if !IsObject(this.ConnectionManager) || !this.ConnectionManager.Credential {
            this.Clear("disconnected", "Connect an Olio account in Settings.")
            return false
        }
        url := LauncherEndpoint.ApiUrl(this.ConnectionManager.Origin)
        if !url {
            this.SetState("error", "The built-in Olio Workstation address is invalid.")
            return false
        }
        window := CalendarClient.TimeWindow()
        body := this.ConnectionManager.Serialize(Map(
            "action", "calendar-schedule",
            "device_id", this.ConnectionManager.Settings["deviceId"],
            "credential", this.ConnectionManager.Credential,
            "time_min", window.Start,
            "time_max", window.End
        ))
        this.RequestBusy := true
        this.SetState("syncing", this.Items.Length
            ? "Refreshing; the current schedule remains visible."
            : "Loading the rest of today's schedule…")
        if !this.Transport.Post(url, body, (result) => this.OnResponse(result)) {
            this.RequestBusy := false
            this.SetRecoverable("offline", "Olio Workstation is unavailable. Try again.")
            return false
        }
        return true
    }

    OnResponse(result) {
        this.RequestBusy := false
        state := IsObject(result) && result.Data is Map && result.Data.Has("state")
            ? String(result.Data["state"]) : "invalid"
        if IsObject(result) && result.Ok && state = "connected" {
            parsed := this.ParseResponse(result.Data)
            if IsObject(parsed) {
                this.ReplaceItems(parsed)
                this.LastSuccessfulAt := A_Now
                if result.Data.Has("synchronized_at")
                    && Type(result.Data["synchronized_at"]) = "String"
                    this.CacheStore.Write(this.Items,
                        this.ConnectionManager.Settings["deviceId"],
                        result.Data["synchronized_at"])
                this.SetState(this.Items.Length ? "ready" : "empty",
                    this.Items.Length ? this.Items.Length " event"
                        . (this.Items.Length = 1 ? "" : "s") " left today."
                        : "Nothing else is scheduled today.")
                return
            }
            this.SetRecoverable("invalid-response",
                "Olio Workstation returned an invalid calendar response.")
            return
        }
        if IsObject(result) && result.Status = 401 {
            this.Clear("revoked", "This launcher was revoked. Connect again in Settings.")
            if IsObject(this.ConnectionManager)
                this.ConnectionManager.InvalidateCredential()
            return
        }
        switch state {
            case "calendar_not_connected":
                this.Clear("calendar-not-connected",
                    "Connect Google Calendar from Profile Settings in Olio Workstation.")
            case "scope_required":
                this.Clear("scope-required",
                    "Reconnect Google Calendar in Olio Workstation to approve launcher access.")
            case "calendar_reconnect_required":
                this.Clear("calendar-reconnect-required",
                    "Google Calendar access expired. Reconnect it in Olio Workstation.")
            case "rate_limited":
                this.SetRecoverable("rate-limited",
                    "Too many refreshes. Wait a few minutes, then try again.")
            default:
                this.SetRecoverable("offline",
                    "Calendar could not synchronize. Check your connection and try again.")
        }
    }

    ParseResponse(data) {
        if !(data is Map) || !data.Has("items") || !(data["items"] is Array)
            return 0
        if !data.Has("synchronized_at") || Type(data["synchronized_at"]) != "String"
            || !LauncherCalendarEvent.UtcStamp(data["synchronized_at"])
            return 0
        if data["items"].Length > CalendarClient.MaxItems
            return 0
        parsed := []
        ids := Map()
        for candidate in data["items"] {
            if !(candidate is Map)
                return 0
            for required in ["id", "title", "start_at", "end_at", "all_day", "ongoing", "location"] {
                if !candidate.Has(required)
                    return 0
            }
            id := candidate["id"], title := candidate["title"]
            startAt := candidate["start_at"], endAt := candidate["end_at"]
            allDay := candidate["all_day"], ongoing := candidate["ongoing"]
            location := candidate["location"]
            if Type(id) != "String" || !id || StrLen(id) > 256 || ids.Has(id)
                || Type(title) != "String" || !Trim(title) || StrLen(title) > 160
                || Type(location) != "String" || StrLen(location) > 160
                || Type(allDay) != "Integer" || !(allDay = 0 || allDay = 1)
                || Type(ongoing) != "Integer" || !(ongoing = 0 || ongoing = 1)
                || !LauncherCalendarEvent.UtcStamp(startAt)
                || !LauncherCalendarEvent.UtcStamp(endAt)
                return 0
            ids[id] := true
            parsed.Push(LauncherCalendarEvent(id, title, startAt, endAt,
                allDay = 1, ongoing = 1, location))
        }
        return parsed
    }

    ReplaceItems(items) {
        for item in this.Items
            item.Release()
        this.Items := items
    }

    LoadCache() {
        if !IsObject(this.ConnectionManager) || !this.ConnectionManager.Credential
            return false
        deviceId := this.ConnectionManager.Settings["deviceId"]
        data := this.CacheStore.Read(deviceId)
        parsed := IsObject(data) ? this.ParseResponse(data) : 0
        if !IsObject(parsed)
            return false
        this.ReplaceItems(parsed)
        this.Items := this.RemainingItems()
        synchronizedAt := data.Has("synchronized_at")
            ? LauncherCalendarEvent.LocalStamp(data["synchronized_at"]) : ""
        this.LastSuccessfulAt := synchronizedAt ? synchronizedAt : A_Now
        this.State := this.Items.Length ? "cached" : "empty"
        this.Detail := this.Items.Length
            ? this.Items.Length " cached event" (this.Items.Length = 1 ? "" : "s") " left today."
            : "Nothing else is scheduled today."
        return true
    }

    RemainingItems() {
        remaining := []
        for item in this.Items {
            start := LauncherCalendarEvent.LocalStamp(item.StartAt)
            end := LauncherCalendarEvent.LocalStamp(item.EndAt)
            if !item.AllDay && (!end || DateDiff(end, A_Now, "Seconds") <= 0)
                continue
            if !item.AllDay && start && end
                item.Ongoing := DateDiff(A_Now, start, "Seconds") >= 0
                    && DateDiff(end, A_Now, "Seconds") > 0
            remaining.Push(item)
        }
        return remaining
    }

    Clear(state := "disconnected", detail := "Connect an Olio account in Settings.",
        deleteCache := true) {
        if this.RequestBusy {
            this.Transport.Cancel()
            this.RequestBusy := false
        }
        this.ReplaceItems([])
        if deleteCache && IsObject(this.CacheStore)
            this.CacheStore.Delete()
        this.LastSuccessfulAt := ""
        this.SetState(state, detail)
    }

    SetRecoverable(state, detail) {
        if this.Items.Length
            detail .= " Showing the last in-memory schedule."
        this.SetState(state, detail)
    }

    SetState(state, detail) {
        this.State := state
        this.Detail := detail
        if IsObject(this.ChangedCallback)
            this.ChangedCallback.Call(state, detail)
    }

    LastSyncDisplay() {
        return this.LastSuccessfulAt
            ? "Updated " FormatTime(this.LastSuccessfulAt, "h:mm tt")
            : "Not updated yet"
    }

    Shutdown() {
        if this.Stopped
            return
        this.Stopped := true
        this.Transport.Cancel()
        this.RequestBusy := false
        this.ReplaceItems([])
        this.State := "stopped"
        this.Detail := ""
        this.ChangedCallback := 0
    }

    __Delete() {
        try this.Shutdown()
    }
}
