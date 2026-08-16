class SettingsManager {
    static CurrentSchemaVersion := 2
    static MinimumPanelWidth := 280
    static MaximumPanelWidth := 640
    static SettingsDir := EnvGet("LOCALAPPDATA") "\OlioLauncher"
    static SettingsPath := SettingsManager.SettingsDir "\settings.json"
    static Values := 0
    static Warnings := []
    static InvalidSource := false
    static Migrated := false
    static LastInvalidBackupPath := ""

    static Defaults() {
        return Map(
            "settingsSchemaVersion", this.CurrentSchemaVersion,
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
            "sensitiveApplications", "KeePass.exe;KeePassXC.exe;1Password.exe;Bitwarden.exe",
            "theme", "system",
            "reducedMotion", true,
            "loggingEnabled", false,
            "lastSelected", "clipboard",
            "rememberedMonitor", "",
            "rememberedX", 0,
            "rememberedY", 0,
            "rememberedPositionValid", false,
            "deviceId", "",
            "deviceName", SubStr(A_ComputerName " Launcher", 1, 80),
            "connectedDeviceName", "",
            "connectedAt", ""
        )
    }

    static Load() {
        this.Warnings := []
        this.InvalidSource := false
        this.Migrated := false
        this.LastInvalidBackupPath := ""
        defaults := this.Defaults()
        if !FileExist(this.SettingsPath) {
            this.Values := defaults
            return this.Values
        }
        try parsed := FlatJson.Parse(FileRead(this.SettingsPath, "UTF-8"))
        catch {
            this.Warnings.Push("settings-json-invalid")
            this.InvalidSource := true
            this.Values := defaults
            return this.Values
        }
        if !(parsed is Map) {
            this.Warnings.Push("settings-root-invalid")
            this.InvalidSource := true
            this.Values := defaults
            return this.Values
        }
        migrated := this.Migrate(parsed)
        warningCount := this.Warnings.Length
        this.Values := this.Validate(migrated)
        this.InvalidSource := this.Warnings.Length > warningCount
        return this.Values
    }

    static Migrate(candidate) {
        result := Map()
        for key, value in candidate
            result[key] := value
        version := 1
        if candidate.Has("settingsSchemaVersion")
            && Type(candidate["settingsSchemaVersion"]) = "Integer"
            && candidate["settingsSchemaVersion"] >= 1
            version := candidate["settingsSchemaVersion"]
        if version > this.CurrentSchemaVersion {
            this.Warnings.Push("settings-future-version")
            return result
        }
        if version < 2 {
            ; Version 2 adds explicit interaction, appearance, and remembered-placement
            ; fields. Validation supplies their safe defaults without changing account
            ; identity or connection metadata.
            if result.Has("openingMonitor") && result["openingMonitor"] = "foreground"
                result["openingMonitor"] := "active"
            if result.Has("openingPosition")
                && (result["openingPosition"] = "edge"
                    || result["openingPosition"] = "right")
                result["openingPosition"] := "middle-right"
            result["settingsSchemaVersion"] := 2
            this.Migrated := true
            this.Warnings.Push("settings-migrated-v2")
        }
        return result
    }

    static Validate(candidate) {
        result := this.Defaults()
        if !(candidate is Map) {
            this.Warnings.Push("settings-root-invalid")
            return result
        }
        this.AcceptInteger(candidate, result, "settingsSchemaVersion", 1,
            this.CurrentSchemaVersion)
        result["settingsSchemaVersion"] := this.CurrentSchemaVersion
        this.AcceptString(candidate, result, "focusKey", 1, 64)
        this.AcceptBoolean(candidate, result, "startWithWindows")
        this.AcceptEnum(candidate, result, "openingMonitor",
            ["active", "primary", "remembered"])
        if candidate.Has("openingPosition")
            && (candidate["openingPosition"] = "top-right"
                || candidate["openingPosition"] = "middle-right")
            result["openingPosition"] := candidate["openingPosition"]
        else if candidate.Has("openingPosition") {
            result["openingPosition"] := "middle-right"
            this.Warnings.Push("openingPosition-defaulted")
        }
        if candidate.Has("launcherScale")
            this.AcceptEnum(candidate, result, "launcherScale",
                ["compact", "standard", "large"])
        else if candidate.Has("panelWidth") && Type(candidate["panelWidth"]) = "Integer"
            && candidate["panelWidth"] >= this.MinimumPanelWidth
            && candidate["panelWidth"] <= this.MaximumPanelWidth {
            result["launcherScale"] := candidate["panelWidth"] <= 336 ? "compact"
                : candidate["panelWidth"] >= 396 ? "large" : "standard"
        } else if candidate.Has("panelWidth")
            this.Warnings.Push("panelWidth-defaulted")
        result["panelWidth"] := this.PanelWidthForScale(result["launcherScale"])
        this.AcceptBoolean(candidate, result, "alwaysOnTop")
        this.AcceptBoolean(candidate, result, "closeOnFocusLost")
        this.AcceptBoolean(candidate, result, "closeAfterSelection")
        this.AcceptBoolean(candidate, result, "autoPasteAfterSelection")
        this.AcceptBoolean(candidate, result, "clipboardPaused")
        this.AcceptSensitiveApplications(candidate, result)
        this.AcceptEnum(candidate, result, "theme", ["system", "dark", "light"])
        ; Motion is permanently reduced. Keep the legacy field in schema v2 so older
        ; settings files remain compatible, but never re-enable animation from disk.
        result["reducedMotion"] := true
        this.AcceptBoolean(candidate, result, "loggingEnabled")
        this.AcceptEnum(candidate, result, "lastSelected",
            ["clipboard", "screenshot", "quickPastes", "settings"])
        this.AcceptString(candidate, result, "rememberedMonitor", 0, 128)
        this.AcceptInteger(candidate, result, "rememberedX", -100000, 100000)
        this.AcceptInteger(candidate, result, "rememberedY", -100000, 100000)
        this.AcceptBoolean(candidate, result, "rememberedPositionValid")
        this.AcceptString(candidate, result, "deviceId", 0, 36)
        this.AcceptString(candidate, result, "deviceName", 1, 80)
        this.AcceptString(candidate, result, "connectedDeviceName", 0, 80)
        this.AcceptString(candidate, result, "connectedAt", 0, 40)
        return result
    }

    static PanelWidthForScale(scale) {
        return scale = "compact" ? 324 : scale = "large" ? 414 : 360
    }

    static AcceptString(candidate, result, key, minimum, maximum) {
        if !candidate.Has(key)
            return
        value := candidate[key]
        if Type(value) = "String" && StrLen(value) >= minimum && StrLen(value) <= maximum
            && !RegExMatch(value, "[\r\n]")
            result[key] := value
        else
            this.Warnings.Push(key "-defaulted")
    }

    static AcceptBoolean(candidate, result, key) {
        if !candidate.Has(key)
            return
        value := candidate[key]
        if Type(value) = "Integer" && (value = 0 || value = 1)
            result[key] := value = 1
        else
            this.Warnings.Push(key "-defaulted")
    }

    static AcceptInteger(candidate, result, key, minimum, maximum) {
        if !candidate.Has(key)
            return
        value := candidate[key]
        if Type(value) = "Integer" && value >= minimum && value <= maximum
            result[key] := value
        else
            this.Warnings.Push(key "-defaulted")
    }

    static AcceptEnum(candidate, result, key, allowed) {
        if !candidate.Has(key)
            return
        value := candidate[key]
        valid := false
        if Type(value) = "String" {
            for item in allowed {
                if value = item {
                    valid := true
                    break
                }
            }
        }
        if valid
            result[key] := value
        else
            this.Warnings.Push(key "-defaulted")
    }

    static AcceptSensitiveApplications(candidate, result) {
        key := "sensitiveApplications"
        if !candidate.Has(key)
            return
        normalized := this.NormalizeSensitiveApplications(candidate[key])
        if normalized.Ok
            result[key] := normalized.Value
        else
            this.Warnings.Push(key "-defaulted")
    }

    static NormalizeSensitiveApplications(value) {
        if Type(value) != "String" || StrLen(value) > 1024
            return {Ok: false, Value: ""}
        applications := [], seen := Map()
        for raw in StrSplit(value, ";") {
            application := Trim(raw, " `t")
            if !application
                continue
            if StrLen(application) > 128
                || !RegExMatch(application, "i)^[a-z0-9][a-z0-9._ ()-]*\.exe$")
                || InStr(application, "\") || InStr(application, "/")
                return {Ok: false, Value: ""}
            key := StrLower(application)
            if seen.Has(key)
                continue
            seen[key] := true
            applications.Push(application)
            if applications.Length > 32
                return {Ok: false, Value: ""}
        }
        joined := ""
        for application in applications
            joined .= (joined ? ";" : "") application
        return {Ok: true, Value: joined}
    }

    static Update(key, value) {
        this.UpdateMany(Map(key, value))
    }

    static UpdateMany(changes) {
        if !IsObject(this.Values)
            this.Load()
        candidate := Map()
        for currentKey, currentValue in this.Values
            candidate[currentKey] := currentValue
        for key, value in changes
            candidate[key] := value
        ; Preserve the legacy width update contract by translating direct numeric
        ; writes to the nearest supported launcher scale.
        if changes.Has("panelWidth") && !changes.Has("launcherScale")
            candidate.Delete("launcherScale")
        this.Warnings := []
        validated := this.Validate(candidate)
        this.Values := validated
        this.Save()
        return this.Values
    }

    static ResetPreservingConnection() {
        if !IsObject(this.Values)
            this.Load()
        reset := this.Defaults()
        ; A settings reset is deliberately not an account disconnect. Preserve the
        ; stable Credential Manager lookup identity and honest connection display
        ; metadata. Disconnect remains a separate confirmed server operation.
        for key in ["deviceId", "deviceName", "connectedDeviceName", "connectedAt"] {
            if this.Values.Has(key)
                reset[key] := this.Values[key]
        }
        this.Values := reset
        this.Warnings := []
        this.InvalidSource := false
        this.Save()
        return this.Values
    }

    static Save() {
        DirCreate(this.SettingsDir)
        if this.InvalidSource && FileExist(this.SettingsPath) {
            backup := this.SettingsDir "\settings.invalid." FormatTime(,
                "yyyyMMdd-HHmmss") "." A_TickCount ".json"
            FileCopy(this.SettingsPath, backup, true)
            this.LastInvalidBackupPath := backup
            this.InvalidSource := false
        }
        json := this.Serialize(this.Values)
        temporary := this.SettingsPath ".tmp."
            DllCall("GetCurrentProcessId", "uint") "." A_TickCount
        outputFile := FileOpen(temporary, "w", "UTF-8-RAW")
        if !outputFile
            throw OSError("Unable to create the temporary settings file.")
        try outputFile.Write(json)
        finally outputFile.Close()
        if !DllCall("MoveFileExW", "str", temporary, "str", this.SettingsPath,
            "uint", 0x1 | 0x8) {
            try FileDelete(temporary)
            throw OSError("Unable to replace settings.json atomically.")
        }
    }

    static Serialize(values) {
        boolean(value) => value ? "true" : "false"
        return "{`n"
            . "  " FlatJson.Quote("settingsSchemaVersion") ": "
                . values["settingsSchemaVersion"] ",`n"
            . "  " FlatJson.Quote("focusKey") ": " FlatJson.Quote(values["focusKey"]) ",`n"
            . "  " FlatJson.Quote("startWithWindows") ": "
                . boolean(values["startWithWindows"]) ",`n"
            . "  " FlatJson.Quote("openingMonitor") ": "
                . FlatJson.Quote(values["openingMonitor"]) ",`n"
            . "  " FlatJson.Quote("openingPosition") ": "
                . FlatJson.Quote(values["openingPosition"]) ",`n"
            . "  " FlatJson.Quote("launcherScale") ": "
                . FlatJson.Quote(values["launcherScale"]) ",`n"
            . "  " FlatJson.Quote("panelWidth") ": " values["panelWidth"] ",`n"
            . "  " FlatJson.Quote("alwaysOnTop") ": "
                . boolean(values["alwaysOnTop"]) ",`n"
            . "  " FlatJson.Quote("closeOnFocusLost") ": "
                . boolean(values["closeOnFocusLost"]) ",`n"
            . "  " FlatJson.Quote("closeAfterSelection") ": "
                . boolean(values["closeAfterSelection"]) ",`n"
            . "  " FlatJson.Quote("autoPasteAfterSelection") ": "
                . boolean(values["autoPasteAfterSelection"]) ",`n"
            . "  " FlatJson.Quote("clipboardPaused") ": "
                . boolean(values["clipboardPaused"]) ",`n"
            . "  " FlatJson.Quote("sensitiveApplications") ": "
                . FlatJson.Quote(values["sensitiveApplications"]) ",`n"
            . "  " FlatJson.Quote("theme") ": " FlatJson.Quote(values["theme"]) ",`n"
            . "  " FlatJson.Quote("reducedMotion") ": "
                . boolean(values["reducedMotion"]) ",`n"
            . "  " FlatJson.Quote("loggingEnabled") ": "
                . boolean(values["loggingEnabled"]) ",`n"
            . "  " FlatJson.Quote("lastSelected") ": "
                . FlatJson.Quote(values["lastSelected"]) ",`n"
            . "  " FlatJson.Quote("rememberedMonitor") ": "
                . FlatJson.Quote(values["rememberedMonitor"]) ",`n"
            . "  " FlatJson.Quote("rememberedX") ": " values["rememberedX"] ",`n"
            . "  " FlatJson.Quote("rememberedY") ": " values["rememberedY"] ",`n"
            . "  " FlatJson.Quote("rememberedPositionValid") ": "
                . boolean(values["rememberedPositionValid"]) ",`n"
            . "  " FlatJson.Quote("deviceId") ": " FlatJson.Quote(values["deviceId"]) ",`n"
            . "  " FlatJson.Quote("deviceName") ": " FlatJson.Quote(values["deviceName"]) ",`n"
            . "  " FlatJson.Quote("connectedDeviceName") ": "
                . FlatJson.Quote(values["connectedDeviceName"]) ",`n"
            . "  " FlatJson.Quote("connectedAt") ": "
                . FlatJson.Quote(values["connectedAt"]) "`n"
            . "}`n"
    }
}
