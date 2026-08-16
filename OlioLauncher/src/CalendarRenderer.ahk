class CalendarRenderer {
    static Lists := Map()

    static Register(control, window) {
        this.Lists[control.Hwnd] := {Control: control, Window: window}
    }

    static DrawItem(drawInfo) {
        if NumGet(drawInfo, 0, "uint") != 2
            return false
        hwndOffset := A_PtrSize = 8 ? 24 : 20
        itemHwnd := NumGet(drawInfo, hwndOffset, "ptr")
        if !this.Lists.Has(itemHwnd)
            return false
        registration := this.Lists[itemHwnd]
        itemId := NumGet(drawInfo, 8, "uint")
        hdc := NumGet(drawInfo, hwndOffset + A_PtrSize, "ptr")
        rectOffset := hwndOffset + (A_PtrSize * 2)
        left := NumGet(drawInfo, rectOffset, "int")
        top := NumGet(drawInfo, rectOffset + 4, "int")
        right := NumGet(drawInfo, rectOffset + 8, "int")
        bottom := NumGet(drawInfo, rectOffset + 12, "int")
        state := NumGet(drawInfo, 16, "uint")
        TileRenderer.FillRect(hdc, left, top, right, bottom, ThemeManager.Color("Window"))
        if itemId = 0xFFFFFFFF
            return true
        index := itemId + 1
        if index < 1 || index > registration.Window.CalendarVisibleItems.Length
            return true

        item := registration.Window.CalendarVisibleItems[index]
        selected := state & 0x1
        focused := state & 0x10
        dpi := TileRenderer.WindowDpi(itemHwnd)
        cardLeft := left + 2, cardTop := top + 4
        cardRight := right - 7, cardBottom := bottom - 4
        radius := Max(8, Round(11 * dpi / 96))
        background := selected ? ThemeManager.Color("SurfaceSelected") : ThemeManager.Color("Surface")
        accent := item.Ongoing ? 0x34D399 : 0xF59E0B
        border := selected ? (ThemeManager.HighContrast ? ThemeManager.Color("Text") : accent)
            : ThemeManager.Color("Border")
        TileRenderer.FillRounded(hdc, cardLeft, cardTop, cardRight, cardBottom, radius, background)
        TileRenderer.StrokeRounded(hdc, cardLeft + 1, cardTop + 1, cardRight - 1,
            cardBottom - 1, radius, border, Max(1, Round((selected || focused ? 2 : 1) * dpi / 96)))
        TileRenderer.FillRounded(hdc, cardLeft, cardTop + 10, cardLeft + Round(4 * dpi / 96),
            cardBottom - 10, 3, ThemeManager.HighContrast ? ThemeManager.Color("Text") : accent)

        timeFont := TileRenderer.CreateFont(8, 600, dpi)
        titleFont := TileRenderer.CreateFont(10, 600, dpi)
        detailFont := TileRenderer.CreateFont(8, 400, dpi)
        try {
            textLeft := cardLeft + Round(16 * dpi / 96)
            textRight := cardRight - Round(10 * dpi / 96)
            flags := 0x00000020 | 0x00000004 | 0x00000800 | 0x00008000
            TileRenderer.DrawText(hdc, item.TimeText(), timeFont,
                item.Ongoing ? accent : ThemeManager.Color("MutedText"), textLeft,
                cardTop + 7, textRight, cardTop + 25, flags)
            TileRenderer.DrawText(hdc, item.SafeTitle(120), titleFont,
                ThemeManager.Color("Text"), textLeft, cardTop + 26,
                textRight, cardTop + 49, flags)
            if item.Location
                TileRenderer.DrawText(hdc, item.SafeLocation(100), detailFont,
                    ThemeManager.Color("MutedText"), textLeft, cardTop + 50,
                    textRight, cardBottom - 5, flags)
        } finally {
            DllCall("DeleteObject", "ptr", timeFont)
            DllCall("DeleteObject", "ptr", titleFont)
            DllCall("DeleteObject", "ptr", detailFont)
        }
        return true
    }
}

