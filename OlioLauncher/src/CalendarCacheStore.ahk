class CalendarCacheStore {
    static MaxBytes := 524288

    __New(path := "") {
        directory := EnvGet("LOCALAPPDATA") "\OlioLauncher"
        this.Path := path ? path : directory "\calendar-cache.bin"
        this.Directory := RegExReplace(this.Path, "\\[^\\]+$")
    }

    Serialize(items, deviceId, synchronizedAt) {
        result := '{"version":1,"date":' FlatJson.Quote(FormatTime(, "yyyy-MM-dd"))
            . ',"device_id":' FlatJson.Quote(deviceId)
            . ',"synchronized_at":' FlatJson.Quote(synchronizedAt) ',"items":['
        first := true
        for item in items {
            result .= (first ? "" : ",") "{"
                . '"id":' FlatJson.Quote(item.Id) ","
                . '"title":' FlatJson.Quote(item.Title) ","
                . '"start_at":' FlatJson.Quote(item.StartAt) ","
                . '"end_at":' FlatJson.Quote(item.EndAt) ","
                . '"all_day":' (item.AllDay ? "true" : "false") ","
                . '"ongoing":' (item.Ongoing ? "true" : "false") ","
                . '"location":' FlatJson.Quote(item.Location) "}"
            first := false
        }
        return result "]}"
    }

    Write(items, deviceId, synchronizedAt) {
        if !RegExMatch(deviceId,
            "i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
            return false
        text := this.Serialize(items, deviceId, synchronizedAt)
        encrypted := this.Protect(text)
        if !IsObject(encrypted) || encrypted.Size > CalendarCacheStore.MaxBytes
            return false
        try DirCreate(this.Directory)
        catch
            return false
        temporary := this.Path ".tmp"
        try {
            stream := FileOpen(temporary, "w")
            if !IsObject(stream)
                return false
            stream.RawWrite(encrypted, encrypted.Size)
            stream.Close()
            FileMove(temporary, this.Path, true)
            return true
        } catch {
            try FileDelete(temporary)
            return false
        }
    }

    Read(deviceId) {
        if !FileExist(this.Path)
            return 0
        try {
            stream := FileOpen(this.Path, "r")
            if !IsObject(stream) || stream.Length < 1 || stream.Length > CalendarCacheStore.MaxBytes {
                if IsObject(stream)
                    stream.Close()
                this.Delete()
                return 0
            }
            encrypted := Buffer(stream.Length, 0)
            stream.RawRead(encrypted, stream.Length)
            stream.Close()
            text := this.Unprotect(encrypted)
            data := text ? FlatJson.Parse(text) : 0
            if !(data is Map) || !data.Has("version") || data["version"] != 1
                || !data.Has("date") || data["date"] != FormatTime(, "yyyy-MM-dd")
                || !data.Has("device_id") || data["device_id"] != deviceId
                || !data.Has("items") || !(data["items"] is Array) {
                this.Delete()
                return 0
            }
            return data
        } catch {
            this.Delete()
            return 0
        }
    }

    Delete() {
        try {
            if FileExist(this.Path)
                FileDelete(this.Path)
            if FileExist(this.Path ".tmp")
                FileDelete(this.Path ".tmp")
            return true
        } catch
            return false
    }

    Protect(text) {
        byteCount := StrPut(text, "UTF-8") - 1
        if byteCount < 1 || byteCount > CalendarCacheStore.MaxBytes
            return 0
        input := Buffer(byteCount + 1, 0)
        StrPut(text, input, "UTF-8")
        inBlob := Buffer(A_PtrSize = 8 ? 16 : 8, 0)
        outBlob := Buffer(A_PtrSize = 8 ? 16 : 8, 0)
        NumPut("uint", byteCount, inBlob, 0)
        NumPut("ptr", input.Ptr, inBlob, A_PtrSize = 8 ? 8 : 4)
        if !DllCall("Crypt32\CryptProtectData", "ptr", inBlob, "str", "Olio calendar cache",
            "ptr", 0, "ptr", 0, "ptr", 0, "uint", 1, "ptr", outBlob, "int")
            return 0
        outputSize := NumGet(outBlob, 0, "uint")
        outputPointer := NumGet(outBlob, A_PtrSize = 8 ? 8 : 4, "ptr")
        try {
            if !outputPointer || outputSize < 1 || outputSize > CalendarCacheStore.MaxBytes
                return 0
            output := Buffer(outputSize, 0)
            DllCall("RtlMoveMemory", "ptr", output.Ptr, "ptr", outputPointer, "uptr", outputSize)
            return output
        } finally {
            if outputPointer
                DllCall("LocalFree", "ptr", outputPointer, "ptr")
        }
    }

    Unprotect(encrypted) {
        inBlob := Buffer(A_PtrSize = 8 ? 16 : 8, 0)
        outBlob := Buffer(A_PtrSize = 8 ? 16 : 8, 0)
        NumPut("uint", encrypted.Size, inBlob, 0)
        NumPut("ptr", encrypted.Ptr, inBlob, A_PtrSize = 8 ? 8 : 4)
        if !DllCall("Crypt32\CryptUnprotectData", "ptr", inBlob, "ptr", 0,
            "ptr", 0, "ptr", 0, "ptr", 0, "uint", 1, "ptr", outBlob, "int")
            return ""
        outputSize := NumGet(outBlob, 0, "uint")
        outputPointer := NumGet(outBlob, A_PtrSize = 8 ? 8 : 4, "ptr")
        try {
            return outputPointer && outputSize > 0 && outputSize <= CalendarCacheStore.MaxBytes
                ? StrGet(outputPointer, outputSize, "UTF-8") : ""
        } finally {
            if outputPointer
                DllCall("LocalFree", "ptr", outputPointer, "ptr")
        }
    }
}
