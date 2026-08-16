#Requires AutoHotkey v2.0.26
#Warn All, StdOut

#Include ..\src\FlatJson.ahk
#Include ..\src\CalendarCacheStore.ahk

class CalendarCacheTests {
    static Assert(condition, message) {
        if !condition
            throw Error(message)
    }

    static Run() {
        path := A_Temp "\OlioLauncher.CalendarCacheTests." DllCall("GetCurrentProcessId") ".bin"
        store := CalendarCacheStore(path)
        store.Delete()
        deviceId := "aaaaaaaa-0000-4000-8000-000000000001"
        item := {
            Id: "event-id",
            Title: "Private planning session",
            StartAt: "2026-08-15T20:00:00.000Z",
            EndAt: "2026-08-15T21:00:00.000Z",
            AllDay: false,
            Ongoing: false,
            Location: "Conference room"
        }
        try {
            this.Assert(store.Write([item], deviceId, "2026-08-15T19:55:00.000Z"),
                "DPAPI cache write failed.")
            raw := FileRead(path, "RAW")
            this.Assert(!InStr(StrGet(raw, raw.Size, "UTF-8"), item.Title),
                "Calendar cache exposed plaintext event content.")
            loaded := store.Read(deviceId)
            this.Assert(loaded is Map && loaded["items"].Length = 1,
                "Calendar cache did not round-trip one event.")
            this.Assert(loaded["items"][1]["title"] = item.Title,
                "Calendar cache changed event content.")
            this.Assert(!IsObject(store.Read("bbbbbbbb-0000-4000-8000-000000000002")),
                "Calendar cache crossed launcher device identity.")
            FileAppend("CALENDAR_CACHE_TEST`tPASS`n", "*")
        } catch as cacheError {
            FileAppend("CALENDAR_CACHE_TEST`tFAIL`t" cacheError.Message "`n", "*")
            ExitApp(1)
        } finally store.Delete()
    }
}

CalendarCacheTests.Run()
ExitApp(0)
