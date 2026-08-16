class WindowsInterop {
    static EnablePerMonitorV2() {
        return DllCall("SetProcessDpiAwarenessContext", "ptr", -4, "ptr")
    }

    static ForegroundWorkArea(usePrimary := false) {
        hwnd := DllCall("GetForegroundWindow", "ptr")
        selectionMode := usePrimary ? "primary" : "active"
        area := this.SelectWorkArea(this.MonitorWorkAreas(), selectionMode, hwnd)
        area.Foreground := hwnd
        return area
    }

    static MonitorWorkAreas() {
        areas := []
        callback := CallbackCreate((monitor, hdc, rect, data) =>
            this.CollectMonitor(areas, monitor), "Fast", 4)
        try DllCall("EnumDisplayMonitors", "ptr", 0, "ptr", 0,
            "ptr", callback, "ptr", 0)
        finally CallbackFree(callback)
        if !areas.Length {
            monitor := DllCall("MonitorFromWindow", "ptr",
                DllCall("GetForegroundWindow", "ptr"), "uint", 2, "ptr")
            areas.Push(this.MonitorArea(monitor))
        }
        return areas
    }

    static CollectMonitor(areas, monitor) {
        try areas.Push(this.MonitorArea(monitor))
        return true
    }

    static MonitorArea(monitor) {
        info := Buffer(104, 0)
        NumPut("uint", info.Size, info, 0)
        if !DllCall("GetMonitorInfoW", "ptr", monitor, "ptr", info)
            throw OSError()
        dpi := 96, dpiY := 96
        try {
            if DllCall("Shcore\GetDpiForMonitor", "ptr", monitor, "uint", 0,
                "uint*", &dpi, "uint*", &dpiY, "uint") != 0
                dpi := 96
        }
        return {
            Handle: monitor,
            Left: NumGet(info, 20, "int"), Top: NumGet(info, 24, "int"),
            Right: NumGet(info, 28, "int"), Bottom: NumGet(info, 32, "int"),
            Primary: (NumGet(info, 36, "uint") & 1) != 0,
            Name: StrGet(info.Ptr + 40, 32, "UTF-16"),
            Dpi: dpi,
            Foreground: 0
        }
    }

    static SelectWorkArea(areas, mode := "active", foregroundHwnd := 0,
        rememberedName := "", rememberedX := 0, rememberedY := 0,
        rememberedPositionValid := false, foregroundMonitorOverride := 0) {
        if !areas.Length
            throw ValueError("At least one monitor work area is required.")
        if mode = "primary" {
            for area in areas {
                if area.Primary
                    return area
            }
            return areas[1]
        }
        if mode = "remembered" {
            if rememberedName {
                for area in areas {
                    if area.Name = rememberedName
                        return area
                }
            }
            if rememberedPositionValid
                return this.NearestArea(areas, rememberedX, rememberedY)
        }
        monitor := foregroundMonitorOverride ? foregroundMonitorOverride : foregroundHwnd
            ? DllCall("MonitorFromWindow", "ptr", foregroundHwnd, "uint", 2, "ptr")
            : 0
        if monitor {
            for area in areas {
                if area.Handle = monitor
                    return area
            }
        }
        for area in areas {
            if area.Primary
                return area
        }
        return areas[1]
    }

    static NearestArea(areas, x, y) {
        best := areas[1], bestDistance := 0
        for index, area in areas {
            nearestX := Max(area.Left, Min(x, area.Right - 1))
            nearestY := Max(area.Top, Min(y, area.Bottom - 1))
            distance := (x - nearestX) ** 2 + (y - nearestY) ** 2
            if index = 1 || distance < bestDistance
                best := area, bestDistance := distance
        }
        return best
    }

    static ClampWindowPosition(area, x, y, width, height) {
        usableWidth := Max(1, area.Right - area.Left)
        usableHeight := Max(1, area.Bottom - area.Top)
        width := Min(Max(1, width), usableWidth)
        height := Min(Max(1, height), usableHeight)
        clampedX := Max(area.Left, Min(x, area.Right - width))
        clampedY := Max(area.Top, Min(y, area.Bottom - height))
        return {
            X: clampedX, Y: clampedY, Width: width, Height: height,
            Recovered: clampedX != x || clampedY != y
        }
    }

    static OpeningCoordinates(area, width, height, position,
        rememberedX := 0, rememberedY := 0, rememberedPositionValid := false) {
        if position = "remembered" && rememberedPositionValid
            return {X: rememberedX, Y: rememberedY}
        if position = "right"
            position := "middle-right"
        parts := StrSplit(position, "-")
        vertical := parts.Length >= 1 ? parts[1] : "middle"
        horizontal := parts.Length >= 2 ? parts[2] : "right"
        usableWidth := Max(1, area.Right - area.Left)
        usableHeight := Max(1, area.Bottom - area.Top)
        x := horizontal = "left" ? area.Left
            : horizontal = "center"
                ? area.Left + Floor((usableWidth - width) / 2)
                : area.Right - width
        y := vertical = "top" ? area.Top
            : vertical = "bottom" ? area.Bottom - height
            : area.Top + Max(0, Floor((usableHeight - height) / 2))
        return {X: x, Y: y}
    }

    static ResolveOpeningGeometry(settings, logicalHeight, foregroundHwnd := 0,
        areas := 0) {
        if !IsObject(areas)
            areas := this.MonitorWorkAreas()
        area := this.SelectWorkArea(areas, settings["openingMonitor"],
            foregroundHwnd, settings["rememberedMonitor"],
            settings["rememberedX"], settings["rememberedY"],
            settings["rememberedPositionValid"])
        width := Round(settings["panelWidth"] * area.Dpi / 96)
        height := Min(Round(logicalHeight * area.Dpi / 96),
            area.Bottom - area.Top)
        coordinates := this.OpeningCoordinates(area, width, height,
            settings["openingPosition"], settings["rememberedX"],
            settings["rememberedY"], settings["rememberedPositionValid"])
        x := coordinates.X, y := coordinates.Y
        geometry := this.ClampWindowPosition(area, x, y, width, height)
        geometry.Area := area
        geometry.Foreground := foregroundHwnd
        return geometry
    }

    static RestoreForeground(hwnd) {
        if hwnd && DllCall("IsWindow", "ptr", hwnd)
            DllCall("SetForegroundWindow", "ptr", hwnd)
    }

    static PasteClipboardToWindow(hwnd) {
        target := this.RootWindow(hwnd)
        if !target || !DllCall("IsWindow", "ptr", target)
            return false
        if !DllCall("SetForegroundWindow", "ptr", target)
            return false
        Sleep(25)
        if this.RootWindow(DllCall("GetForegroundWindow", "ptr")) != target
            return false

        inputSize := A_PtrSize = 8 ? 40 : 28
        unionOffset := A_PtrSize = 8 ? 8 : 4
        flagsOffset := unionOffset + 4
        inputs := Buffer(inputSize * 4, 0)
        keys := [
            {Vk: 0x11, Flags: 0},
            {Vk: 0x56, Flags: 0},
            {Vk: 0x56, Flags: 0x2},
            {Vk: 0x11, Flags: 0x2}
        ]
        for index, key in keys {
            offset := (index - 1) * inputSize
            NumPut("uint", 1, inputs, offset)
            NumPut("ushort", key.Vk, inputs, offset + unionOffset)
            NumPut("uint", key.Flags, inputs, offset + flagsOffset)
        }
        return DllCall("SendInput", "uint", keys.Length, "ptr", inputs,
            "int", inputSize, "uint") = keys.Length
    }

    static RootWindow(hwnd) {
        return hwnd ? DllCall("GetAncestor", "ptr", hwnd, "uint", 2, "ptr") : 0
    }

    static AnnounceStatus(control) {
        hwnd := IsObject(control) ? control.Hwnd : control
        if hwnd
            DllCall("NotifyWinEvent", "uint", 0x800C, "ptr", hwnd,
                "int", -4, "int", 0) ; EVENT_OBJECT_NAMECHANGE, OBJID_CLIENT
    }
}
