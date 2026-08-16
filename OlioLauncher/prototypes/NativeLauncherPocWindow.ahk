class PocCommandRenderer {
    static Items := Map()
    static Commands := Map()
    static Lists := Map()
    static HoveredHwnd := 0
    static KeyboardMode := false
    static Initialized := false
    static DarkColors := Map(
        "Window", 0x2C2C2F, "Surface", 0x3A3A3D,
        "SurfaceHover", 0x454347, "SurfacePressed", 0x333335,
        "DisabledSurface", 0x343437, "Text", 0xF2F2F2,
        "MutedText", 0x9A9A9D, "TertiaryText", 0x77777B,
        "Border", 0x47474B, "MutedBorder", 0x555559,
        "SelectedSurface", 0x414145, "OuterBorder", 0x47474B)
    static LightColors := Map(
        "Window", 0xF3F3F3, "Surface", 0xFFFFFF,
        "SurfaceHover", 0xE9E9E9, "SurfacePressed", 0xDDDDDD,
        "DisabledSurface", 0xE5E5E5, "Text", 0x1A1A1A,
        "MutedText", 0x66666A, "TertiaryText", 0x858589,
        "Border", 0xD8D8DC, "MutedBorder", 0xC7C7CB,
        "SelectedSurface", 0xE8F3FF, "OuterBorder", 0xC7C7CB)

    static Initialize() {
        if this.Initialized
            return
        this.Initialized := true
        ; POC controls are handled first. Returning blank passes unrelated production
        ; controls through to their existing renderers.
        OnMessage(0x002B, (w, l, m, h) => this.OnDrawItem(w, l, m, h), -1)
        OnMessage(0x0200, (w, l, m, h) => this.OnMouseMove(w, l, m, h), -1)
        OnMessage(0x02A3, (w, l, m, h) => this.OnMouseLeave(w, l, m, h), -1)
        OnMessage(0x0100, (w, l, m, h) => this.OnKeyDown(w, l, m, h), -1)
        OnMessage(0x0201, (w, l, m, h) => this.OnMouseDown(w, l, m, h), -1)
    }

    static Color(name) {
        if ThemeManager.HighContrast {
            mapping := Map(
                "Window", "LauncherWindow", "Surface", "LauncherSurface",
                "SurfaceHover", "LauncherSurfaceHover",
                "SurfacePressed", "LauncherSurfacePressed",
                "DisabledSurface", "DisabledSurface", "Text", "Text",
                "MutedText", "MutedText", "TertiaryText", "MutedText",
                "Border", "LauncherBorder", "MutedBorder", "MutedBorder",
                "SelectedSurface", "LauncherSurfaceSelected",
                "OuterBorder", "LauncherBorder")
            return ThemeManager.Color(mapping[name])
        }
        palette := ThemeManager.Mode = "light" ? this.LightColors : this.DarkColors
        return palette[name]
    }

    static Hex(name) => Format("{:06X}", this.Color(name))

    static Register(control, title, subtitle, glyph, showChevron := true) {
        this.Initialize()
        TileRenderer.Unregister(control)
        item := {Kind: "command", Title: title, Subtitle: subtitle,
            Glyph: glyph, ShowChevron: showChevron, Selected: false, Enabled: true}
        this.Items[control.Hwnd] := item
        this.Commands[control.Hwnd] := item
    }

    static RegisterCircle(control, glyph, tone := "normal") {
        this.Initialize()
        TileRenderer.Unregister(control)
        this.Items[control.Hwnd] := {Kind: "circle", Glyph: glyph,
            Tone: tone, Enabled: control.Enabled}
    }

    static RegisterChip(control, title, tone := "normal") {
        this.Initialize()
        TileRenderer.Unregister(control)
        this.Items[control.Hwnd] := {Kind: "chip", Title: title,
            Tone: tone, Enabled: control.Enabled}
    }

    static RegisterPlaceholder(control) {
        this.Initialize()
        TileRenderer.Unregister(control)
        this.Items[control.Hwnd] := {Kind: "placeholder", Title: "", Enabled: false}
        control.Enabled := false
    }

    static RegisterList(control, kind, source) {
        this.Initialize()
        if kind = "clipboard" && ClipboardRenderer.Lists.Has(control.Hwnd)
            ClipboardRenderer.Lists.Delete(control.Hwnd)
        if kind = "quick" && QuickPastesRenderer.Lists.Has(control.Hwnd)
            QuickPastesRenderer.Lists.Delete(control.Hwnd)
        this.Lists[control.Hwnd] := {Kind: kind, Source: source}
    }

    static SetSubtitle(control, subtitle) {
        hwnd := IsObject(control) ? control.Hwnd : control
        if !this.Commands.Has(hwnd) || this.Commands[hwnd].Subtitle = subtitle
            return
        this.Commands[hwnd].Subtitle := subtitle
        DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }

    static SetTitle(control, title) {
        hwnd := IsObject(control) ? control.Hwnd : control
        if !this.Items.Has(hwnd) || this.Items[hwnd].Title = title
            return
        this.Items[hwnd].Title := title
        DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }

    static SetSelected(control) {
        selectedHwnd := IsObject(control) ? control.Hwnd : control
        for hwnd, command in this.Commands {
            selected := hwnd = selectedHwnd
            if command.Selected != selected {
                command.Selected := selected
                DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
            }
        }
    }

    static SetEnabled(control, enabled) {
        hwnd := IsObject(control) ? control.Hwnd : control
        if !this.Items.Has(hwnd)
            return
        enabled := !!enabled
        this.Items[hwnd].Enabled := enabled
        DllCall("EnableWindow", "ptr", hwnd, "int", enabled)
        DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }

    static RefreshAll() {
        for hwnd in this.Items
            DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
        for hwnd in this.Lists
            DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }

    static OnDrawItem(wParam, drawInfo, msg, hwnd) {
        itemType := NumGet(drawInfo, 0, "uint")
        hwndOffset := A_PtrSize = 8 ? 24 : 20
        itemHwnd := NumGet(drawInfo, hwndOffset, "ptr")
        if itemType = 4 && this.Items.Has(itemHwnd)
            return this.DrawButton(drawInfo, itemHwnd, hwndOffset)
        if itemType = 2 && this.Lists.Has(itemHwnd)
            return this.DrawListItem(drawInfo, itemHwnd, hwndOffset)
        return
    }

    static DrawButton(drawInfo, itemHwnd, hwndOffset) {
        item := this.Items[itemHwnd]
        hdc := NumGet(drawInfo, hwndOffset + A_PtrSize, "ptr")
        rectOffset := hwndOffset + (A_PtrSize * 2)
        left := NumGet(drawInfo, rectOffset, "int")
        top := NumGet(drawInfo, rectOffset + 4, "int")
        right := NumGet(drawInfo, rectOffset + 8, "int")
        bottom := NumGet(drawInfo, rectOffset + 12, "int")
        state := NumGet(drawInfo, 16, "uint")
        disabled := !item.Enabled || (state & 0x4)
        pressed := state & 0x1
        focused := state & 0x10
        hovered := itemHwnd = this.HoveredHwnd
        dpi := TileRenderer.WindowDpi(itemHwnd)
        scale(value) => Round(value * dpi / 96)
        accent := ThemeManager.Color("Accent", 0x38BDF8)
        parent := this.Color("Window")
        surface := disabled ? this.Color("DisabledSurface")
            : pressed ? this.Color("SurfacePressed")
            : hovered ? this.Color("SurfaceHover")
            : this.Color("Surface")
        TileRenderer.FillRect(hdc, left, top, right, bottom, parent)

        if item.Kind = "placeholder" {
            radius := Max(4, scale(5))
            pen := DllCall("CreatePen", "int", 2, "int", Max(1, scale(1)),
                "uint", TileRenderer.ColorRef(this.Color("MutedBorder")), "ptr")
            oldPen := DllCall("SelectObject", "ptr", hdc, "ptr", pen, "ptr")
            oldBrush := DllCall("SelectObject", "ptr", hdc,
                "ptr", DllCall("GetStockObject", "int", 5, "ptr"), "ptr")
            DllCall("RoundRect", "ptr", hdc, "int", left, "int", top,
                "int", right - 1, "int", bottom - 1, "int", radius, "int", radius)
            DllCall("SelectObject", "ptr", hdc, "ptr", oldBrush)
            DllCall("SelectObject", "ptr", hdc, "ptr", oldPen)
            DllCall("DeleteObject", "ptr", pen)
            if item.Title {
                font := TileRenderer.CreateFont(8, 400, dpi, "Segoe UI Variable")
                try TileRenderer.DrawText(hdc, item.Title, font,
                    this.Color("MutedText"), left + scale(12), top,
                    right - scale(8), bottom, 0x00000020 | 0x00000800)
                finally DllCall("DeleteObject", "ptr", font)
            }
            return true
        }

        if item.Kind = "command" {
            radius := Max(12, scale(16))
            TileRenderer.FillRounded(hdc, left, top, right, bottom, radius, surface)
            if ThemeManager.HighContrast || (focused && this.KeyboardMode)
                TileRenderer.StrokeRounded(hdc, left, top, right - 1, bottom - 1,
                    radius, focused ? accent : this.Color("Border"),
                    Max(1, scale(1)))

            badgeLeft := left + scale(10)
            badgeTop := top + scale(8)
            badgeSize := scale(34)
            badgeColor := item.Selected && !disabled ? accent
                : TileRenderer.BlendRgb(this.Color("Text"), surface, 0.09)
            TileRenderer.FillRounded(hdc, badgeLeft, badgeTop,
                badgeLeft + badgeSize, badgeTop + badgeSize, badgeSize, badgeColor)
            iconColor := disabled ? this.Color("TertiaryText")
                : item.Selected ? 0xFFFFFF : this.Color("Text")
            iconFont := TileRenderer.CreateFont(12, 400, dpi, "Segoe Fluent Icons")
            titleFont := TileRenderer.CreateFont(9, 600, dpi, "Segoe UI Variable")
            statusFont := TileRenderer.CreateFont(8, 400, dpi, "Segoe UI Variable")
            chevronFont := TileRenderer.CreateFont(8, 400, dpi, "Segoe Fluent Icons")
            textLeft := left + scale(54)
            textRight := right - scale(item.ShowChevron ? 30 : 10)
            try {
                TileRenderer.DrawText(hdc, item.Glyph, iconFont, iconColor,
                    badgeLeft, badgeTop, badgeLeft + badgeSize, badgeTop + badgeSize)
                TileRenderer.DrawText(hdc, item.Title, titleFont,
                    disabled ? this.Color("TertiaryText") : this.Color("Text"),
                    textLeft, top + scale(7), textRight, top + scale(28),
                    0x00000020 | 0x00000800)
                TileRenderer.DrawText(hdc, item.Subtitle, statusFont,
                    disabled ? this.Color("TertiaryText") : this.Color("MutedText"),
                    textLeft, top + scale(27), textRight, bottom - scale(4),
                    0x00000020 | 0x00000800)
                if item.ShowChevron
                    TileRenderer.DrawText(hdc, Chr(0xE76C), chevronFont,
                        this.Color("MutedText"), right - scale(25), top,
                        right - scale(5), bottom)
            } finally {
                DllCall("DeleteObject", "ptr", iconFont)
                DllCall("DeleteObject", "ptr", titleFont)
                DllCall("DeleteObject", "ptr", statusFont)
                DllCall("DeleteObject", "ptr", chevronFont)
            }
            return true
        }

        if item.Kind = "chip" {
            radius := Max(18, bottom - top)
            TileRenderer.FillRounded(hdc, left, top, right, bottom, radius, surface)
            if focused && this.KeyboardMode
                TileRenderer.StrokeRounded(hdc, left, top, right - 1, bottom - 1,
                    radius, accent, Max(1, scale(1)))
            color := disabled ? this.Color("TertiaryText")
                : item.Tone = "danger" && hovered ? ThemeManager.Color("ErrorText")
                : this.Color("MutedText")
            font := TileRenderer.CreateFont(8, 600, dpi, "Segoe UI Variable")
            try TileRenderer.DrawText(hdc, item.Title, font, color,
                left + scale(5), top, right - scale(5), bottom)
            finally DllCall("DeleteObject", "ptr", font)
            return true
        }

        radius := Max(18, bottom - top)
        TileRenderer.FillRounded(hdc, left, top, right, bottom, radius, surface)
        if focused && this.KeyboardMode
            TileRenderer.StrokeRounded(hdc, left, top, right - 1, bottom - 1,
                radius, accent, Max(1, scale(1)))
        color := disabled ? this.Color("TertiaryText")
            : item.Tone = "danger" ? ThemeManager.Color("ErrorText")
            : item.Tone = "accent" ? accent : this.Color("MutedText")
        font := TileRenderer.CreateFont(10, 400, dpi, "Segoe Fluent Icons")
        try TileRenderer.DrawText(hdc, item.Glyph, font, color,
            left, top, right, bottom)
        finally DllCall("DeleteObject", "ptr", font)
        return true
    }

    static DrawListItem(drawInfo, itemHwnd, hwndOffset) {
        registration := this.Lists[itemHwnd]
        hdc := NumGet(drawInfo, hwndOffset + A_PtrSize, "ptr")
        rectOffset := hwndOffset + (A_PtrSize * 2)
        left := NumGet(drawInfo, rectOffset, "int")
        top := NumGet(drawInfo, rectOffset + 4, "int")
        right := NumGet(drawInfo, rectOffset + 8, "int")
        bottom := NumGet(drawInfo, rectOffset + 12, "int")
        itemId := NumGet(drawInfo, 8, "uint")
        state := NumGet(drawInfo, 16, "uint")
        TileRenderer.FillRect(hdc, left, top, right, bottom,
            this.Color("Window"))
        if itemId = 0xFFFFFFFF
            return true

        index := itemId + 1
        if registration.Kind = "clipboard" {
            manager := registration.Source
            if !IsObject(manager) || index > manager.Entries.Length
                return true
            entry := manager.Entries[index]
            return this.DrawClipboardItem(hdc, entry, left, top, right, bottom,
                state, itemHwnd)
        }
        window := registration.Source
        if !IsObject(window) || index > window.QuickVisibleItems.Length
            return true
        return this.DrawQuickItem(hdc, window.QuickVisibleItems[index], left,
            top, right, bottom, state, itemHwnd)
    }

    static DrawClipboardItem(hdc, entry, left, top, right, bottom, state, hwnd) {
        selected := state & 0x1
        focused := state & 0x10
        dpi := TileRenderer.WindowDpi(hwnd)
        scale(value) => Round(value * dpi / 96)
        accent := ThemeManager.Color("Accent")
        cardLeft := left + scale(1), cardTop := top + scale(3)
        cardRight := right - scale(4), cardBottom := bottom - scale(3)
        surface := selected ? this.Color("SelectedSurface") : this.Color("Surface")
        TileRenderer.FillRounded(hdc, cardLeft, cardTop, cardRight, cardBottom,
            scale(16), surface)
        if selected || focused
            TileRenderer.StrokeRounded(hdc, cardLeft, cardTop, cardRight,
                cardBottom, scale(16), accent, Max(1, scale(1)))

        iconLeft := cardLeft + scale(8), iconTop := cardTop + scale(7)
        iconWidth := scale(34), iconHeight := scale(29)
        TileRenderer.FillRounded(hdc, iconLeft, iconTop, iconLeft + iconWidth,
            iconTop + iconHeight, scale(10), this.Color("DisabledSurface"))
        iconFont := TileRenderer.CreateFont(10, 400, dpi, "Segoe Fluent Icons")
        titleFont := TileRenderer.CreateFont(8, 600, dpi, "Segoe UI Variable")
        metaFont := TileRenderer.CreateFont(7, 400, dpi, "Segoe UI Variable")
        kind := entry.Kind
        title := kind = "image"
            ? "Image" (entry.HasOwnProp("Width") ? " · " entry.Width " × " entry.Height : "")
            : entry.SafePreview(70)
        glyph := kind = "image" ? Chr(0xEB9F) : Chr(0xE8A5)
        meta := entry.HasOwnProp("DisplayTime") ? entry.DisplayTime : ""
        try {
            TileRenderer.DrawText(hdc, glyph, iconFont, this.Color("MutedText"),
                iconLeft, iconTop, iconLeft + iconWidth, iconTop + iconHeight)
            TileRenderer.DrawText(hdc, title, titleFont, this.Color("Text"),
                cardLeft + scale(50), cardTop + scale(5), cardRight - scale(58),
                cardTop + scale(24), 0x00000020 | 0x00000800)
            TileRenderer.DrawText(hdc, meta, metaFont, this.Color("MutedText"),
                cardLeft + scale(50), cardTop + scale(23), cardRight - scale(58),
                cardBottom - scale(3), 0x00000020 | 0x00000800)
        } finally {
            DllCall("DeleteObject", "ptr", iconFont)
            DllCall("DeleteObject", "ptr", titleFont)
            DllCall("DeleteObject", "ptr", metaFont)
        }
        return true
    }

    static DrawQuickItem(hdc, item, left, top, right, bottom, state, hwnd) {
        selected := state & 0x1
        focused := state & 0x10
        dpi := TileRenderer.WindowDpi(hwnd)
        scale(value) => Round(value * dpi / 96)
        accent := ThemeManager.Color("Accent")
        cardLeft := left + scale(1), cardTop := top + scale(3)
        cardRight := right - scale(4), cardBottom := bottom - scale(3)
        surface := selected ? this.Color("SelectedSurface") : this.Color("Surface")
        TileRenderer.FillRounded(hdc, cardLeft, cardTop, cardRight, cardBottom,
            scale(16), surface)
        if selected || focused
            TileRenderer.StrokeRounded(hdc, cardLeft, cardTop, cardRight,
                cardBottom, scale(16), accent, Max(1, scale(1)))

        glyphFont := TileRenderer.CreateFont(8, 400, dpi, "Segoe Fluent Icons")
        titleFont := TileRenderer.CreateFont(8, 600, dpi, "Segoe UI Variable")
        metaFont := TileRenderer.CreateFont(7, 400, dpi, "Segoe UI Variable")
        category := item.Category ? item.SafeCategory(40) : "Uncategorized"
        category .= " · Text"
        try {
            TileRenderer.DrawText(hdc, Chr(0xE734), glyphFont,
                item.IsFavorite ? accent : this.Color("TertiaryText"),
                cardLeft + scale(7), cardTop, cardLeft + scale(27), cardBottom)
            TileRenderer.DrawText(hdc, item.SafeTitle(80), titleFont,
                this.Color("Text"), cardLeft + scale(30), cardTop + scale(5),
                cardRight - scale(58), cardTop + scale(24),
                0x00000020 | 0x00000800)
            TileRenderer.DrawText(hdc, category, metaFont,
                this.Color("MutedText"), cardLeft + scale(30),
                cardTop + scale(23), cardRight - scale(58), cardBottom - scale(3),
                0x00000020 | 0x00000800)
        } finally {
            DllCall("DeleteObject", "ptr", glyphFont)
            DllCall("DeleteObject", "ptr", titleFont)
            DllCall("DeleteObject", "ptr", metaFont)
        }
        return true
    }

    static OnKeyDown(wParam, lParam, msg, hwnd) {
        if wParam != 0x09 && wParam != 0x25 && wParam != 0x26
            && wParam != 0x27 && wParam != 0x28
            return
        if !this.KeyboardMode {
            this.KeyboardMode := true
            this.RefreshAll()
        }
    }

    static OnMouseDown(wParam, lParam, msg, hwnd) {
        if !this.Items.Has(hwnd) && !this.Lists.Has(hwnd)
            return
        if this.KeyboardMode {
            this.KeyboardMode := false
            this.RefreshAll()
        }
    }

    static OnMouseMove(wParam, lParam, msg, hwnd) {
        if !this.Items.Has(hwnd) || !this.Items[hwnd].Enabled
            return
        if this.HoveredHwnd != hwnd {
            previous := this.HoveredHwnd
            this.HoveredHwnd := hwnd
            if previous
                DllCall("InvalidateRect", "ptr", previous, "ptr", 0, "int", true)
            DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
        }
        tracking := Buffer(A_PtrSize = 8 ? 24 : 16, 0)
        NumPut("uint", tracking.Size, tracking, 0)
        NumPut("uint", 0x2, tracking, 4)
        NumPut("ptr", hwnd, tracking, 8)
        DllCall("TrackMouseEvent", "ptr", tracking)
    }

    static OnMouseLeave(wParam, lParam, msg, hwnd) {
        if hwnd != this.HoveredHwnd
            return
        this.HoveredHwnd := 0
        DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }
}

class NativeLauncherPocWindow extends LauncherWindow {
    static BaseWidth := 296
    static BaseHeight := 260
    static StatusBaseHeight := 298

    __New(settings, navigateCallback, visualTestMode := false, clipboardManager := 0,
        connectionManager := 0, quickPastesManager := 0, settingsApplyCallback := 0) {
        this.PocReady := false
        super.__New(settings, navigateCallback, visualTestMode, clipboardManager,
            connectionManager, quickPastesManager, settingsApplyCallback)
        this.PocReady := true
        this.Gui.Title := "Olio Launcher - Native POC"
        this.Gui.MarginX := 0
        this.Gui.MarginY := 0
        this.Wordmark.Text := "OLIO"
        this.Wordmark.SetFont("s8 bold", "Segoe UI Variable")

        this.Gui.SetFont("s8", "Segoe UI Variable")
        this.FooterRule := this.Gui.AddText("Hidden")
        this.HomeControls.Push(this.FooterRule)
        this.ClipboardPlaceholders := []
        Loop 3 {
            placeholder := this.Gui.Add("Custom",
                "ClassButton Hidden Disabled 0x5001000B", "Empty clipboard slot")
            this.ClipboardPlaceholders.Push(placeholder)
            this.ClipboardControls.Push(placeholder)
            PocCommandRenderer.RegisterPlaceholder(placeholder)
        }

        PocCommandRenderer.Register(this.Buttons["clipboard"], "Clipboard",
            "0 items", Chr(0xE77F), true)
        PocCommandRenderer.Register(this.Buttons["screenshot"], "Screenshot",
            "Select an area", Chr(0xE722), false)
        PocCommandRenderer.Register(this.Buttons["quickPastes"], "Quick Pastes",
            "Not connected", Chr(0xE8A5), true)
        PocCommandRenderer.RegisterCircle(this.Buttons["settings"], Chr(0xE713))
        PocCommandRenderer.RegisterCircle(this.BackButton, Chr(0xE72B))
        PocCommandRenderer.RegisterChip(this.ClipboardClearButton, "Clear all", "danger")
        PocCommandRenderer.RegisterCircle(this.ClipboardOpenButton, Chr(0xE8A7), "accent")
        PocCommandRenderer.RegisterCircle(this.ClipboardDeleteButton, Chr(0xE74D), "danger")
        PocCommandRenderer.RegisterCircle(this.QuickRefreshButton, Chr(0xE72C))
        PocCommandRenderer.RegisterCircle(this.QuickCopyButton, Chr(0xE8C8), "accent")
        PocCommandRenderer.RegisterCircle(this.QuickPasteButton, Chr(0xE77F), "accent")
        PocCommandRenderer.RegisterList(this.ClipboardList, "clipboard", this.ClipboardManager)
        PocCommandRenderer.RegisterList(this.QuickPasteList, "quick", this)
        PocCommandRenderer.SetSelected(this.Buttons["clipboard"])

        this.LayoutForLauncherScale(this.LauncherScale)
        this.ApplyTheme()
        this.ShowHome(false)
    }

    LayoutForLauncherScale(scale) {
        super.LayoutForLauncherScale(scale)
        if !this.PocReady
            return

        this.LauncherScale := scale
        this.ScaleFactor := LauncherWindow.ScaleFactorFor(scale)
        metric(value) => Round(value * this.ScaleFactor)
        this.LogicalWidth := metric(NativeLauncherPocWindow.BaseWidth)
        this.DesiredLogicalHeight := metric(NativeLauncherPocWindow.BaseHeight)

        this.Logo.Move(0, 0, 1, 1)
        this.Wordmark.Move(metric(14), metric(10), metric(100), metric(18))
        this.Buttons["clipboard"].Move(metric(10), metric(35), metric(276), metric(51))
        this.Buttons["screenshot"].Move(metric(10), metric(92), metric(276), metric(51))
        this.Buttons["quickPastes"].Move(metric(10), metric(149), metric(276), metric(51))
        this.FooterRule.Move(metric(10), metric(210), metric(276), Max(1, metric(1)))
        this.Buttons["settings"].Move(metric(255), metric(222), metric(28), metric(28))
        this.StatusText.Move(metric(10), metric(266), metric(276), metric(26))

        this.BackButton.Move(metric(10), metric(8), metric(24), metric(24))
        this.PageTitle.Move(metric(40), metric(7), metric(184), metric(26))
        this.PageSubtitle.Move(0, 0, 1, 1)
        this.ClipboardClearButton.Move(metric(226), metric(8), metric(60), metric(24))
        this.ClipboardStatus.Move(0, 0, 1, 1)
        this.ClipboardList.Move(metric(10), metric(40), metric(276), metric(210))
        this.ClipboardOpenButton.Move(metric(226), metric(53), metric(22), metric(22))
        this.ClipboardDeleteButton.Move(metric(254), metric(53), metric(22), metric(22))
        for index, placeholder in this.ClipboardPlaceholders
            placeholder.Move(metric(10), metric(43 + (index - 1) * 35),
                metric(276), metric(29))

        this.QuickRefreshButton.Move(metric(262), metric(8), metric(24), metric(24))
        this.QuickStatus.Move(0, 0, 1, 1)
        this.QuickSearchLabel.Move(0, 0, 1, 1)
        this.QuickSearchEdit.Move(metric(10), metric(40), metric(276), metric(30))
        this.QuickPasteList.Move(metric(10), metric(76), metric(276), metric(174))
        this.QuickFooter.Move(0, 0, 1, 1)
        this.QuickCopyButton.Move(metric(226), metric(90), metric(22), metric(22))
        this.QuickPasteButton.Move(metric(254), metric(90), metric(22), metric(22))
        this.QuickSettingsButton.Move(0, 0, 1, 1)
        this.HidePocChrome()
        this.SetCompactItemHeight(this.ClipboardList, 48)
        this.SetCompactItemHeight(this.QuickPasteList, 50)
        this.PositionClipboardActions()
        this.PositionQuickActions()
    }

    ApplyTheme() {
        super.ApplyTheme()
        if !this.PocReady
            return
        this.Gui.BackColor := PocCommandRenderer.Hex("Window")
        this.Wordmark.SetFont("c" PocCommandRenderer.Hex("MutedText"),
            "Segoe UI Variable")
        this.PageTitle.SetFont("s8 bold c" PocCommandRenderer.Hex("Text"),
            "Segoe UI Variable")
        this.FooterRule.Opt("Background" PocCommandRenderer.Hex("Border"))
        this.ClipboardList.Opt("Background" PocCommandRenderer.Hex("Window")
            " c" PocCommandRenderer.Hex("Text"))
        this.QuickPasteList.Opt("Background" PocCommandRenderer.Hex("Window")
            " c" PocCommandRenderer.Hex("Text"))
        this.QuickSearchEdit.Opt("Background" PocCommandRenderer.Hex("SurfacePressed")
            " c" PocCommandRenderer.Hex("Text"))
        this.QuickSearchEdit.SetFont("s8.5", "Segoe UI Variable")
        this.ApplyPocWindowStyle()
        PocCommandRenderer.RefreshAll()
    }

    ShowHome(focusSelected := true) {
        super.ShowHome(focusSelected)
        if !this.PocReady
            return
        this.Wordmark.Visible := true
        this.FooterRule.Visible := true
        this.HidePocChrome()
        PocCommandRenderer.SetSelected(this.Buttons["clipboard"])
        this.UpdateHomeStatuses()
    }

    ShowPage(key) {
        super.ShowPage(key)
        if !this.PocReady
            return
        this.Wordmark.Visible := false
        this.FooterRule.Visible := false
        this.HidePocChrome()
        this.PageTitle.Visible := true
        if key = "clipboard" {
            this.UpdateClipboardPageTitle()
            this.UpdateClipboardCapacityHint()
            this.PositionClipboardActions()
            if !IsObject(this.ClipboardManager) || !this.ClipboardManager.Entries.Length
                this.BackButton.Focus()
        } else if key = "quickPastes" {
            this.PageTitle.Text := "Quick Pastes"
            this.PositionQuickActions()
            if !this.QuickVisibleItems.Length && !this.QuickRefreshButton.Enabled
                this.BackButton.Focus()
        }
    }

    CurrentLogicalHeight() {
        if !this.PocReady
            return super.CurrentLogicalHeight()
        if this.PageKey = "clipboard" || this.PageKey = "quickPastes"
            return Round(NativeLauncherPocWindow.BaseHeight * this.ScaleFactor)
        if this.PageKey
            return super.CurrentLogicalHeight()
        baseHeight := this.HasVisibleStatus
            ? NativeLauncherPocWindow.StatusBaseHeight
            : NativeLauncherPocWindow.BaseHeight
        return Round(baseHeight * this.ScaleFactor)
    }

    RefreshClipboardHistory(status := "") {
        super.RefreshClipboardHistory(status)
        if !this.PocReady
            return
        this.SetCompactItemHeight(this.ClipboardList, 48)
        count := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries.Length : 0
        PocCommandRenderer.SetEnabled(this.ClipboardClearButton, count > 0)
        PocCommandRenderer.SetEnabled(this.ClipboardDeleteButton, count > 0)
        this.UpdateClipboardPageTitle()
        this.UpdateClipboardCapacityHint()
        this.UpdateHomeStatuses()
        this.UpdateClipboardOpenState()
        this.PositionClipboardActions()
    }

    UpdateClipboardOpenState() {
        enabled := super.UpdateClipboardOpenState()
        if this.PocReady
            PocCommandRenderer.SetEnabled(this.ClipboardOpenButton, enabled)
        return enabled
    }

    RefreshQuickPasteList() {
        super.RefreshQuickPasteList()
        if !this.PocReady
            return
        this.SetCompactItemHeight(this.QuickPasteList, 50)
        this.UpdateHomeStatuses()
        this.PositionQuickActions()
    }

    RefreshQuickPastes() {
        super.RefreshQuickPastes()
        if !this.PocReady
            return
        hasCredential := IsObject(this.ConnectionManager)
            && !!this.ConnectionManager.Credential
        busy := IsObject(this.QuickPastesManager) && this.QuickPastesManager.RequestBusy
        PocCommandRenderer.SetEnabled(this.QuickRefreshButton, hasCredential && !busy)
        this.QuickSettingsButton.Visible := false
        this.QuickStatus.Visible := false
        this.QuickSearchLabel.Visible := false
        this.QuickFooter.Visible := false
        this.UpdateQuickPasteActionState()
        this.PositionQuickActions()
        controls := [this.BackButton, this.QuickRefreshButton,
            this.QuickSearchEdit, this.QuickPasteList]
        if this.QuickCopyButton.Visible
            controls.Push(this.QuickCopyButton)
        if this.QuickPasteButton.Visible
            controls.Push(this.QuickPasteButton)
        this.Navigation.Controls := controls
    }

    UpdateQuickPasteActionState() {
        enabled := super.UpdateQuickPasteActionState()
        if this.PocReady {
            PocCommandRenderer.SetEnabled(this.QuickCopyButton, enabled)
            PocCommandRenderer.SetEnabled(this.QuickPasteButton, enabled)
        }
        return enabled
    }

    OnClipboardHistoryChanged(status) {
        super.OnClipboardHistoryChanged(status)
        if this.PocReady
            this.UpdateHomeStatuses()
    }

    OnQuickPastesChanged(state, detail) {
        super.OnQuickPastesChanged(state, detail)
        if this.PocReady
            this.UpdateHomeStatuses()
    }

    OnConnectionChanged(state, detail) {
        super.OnConnectionChanged(state, detail)
        if this.PocReady
            this.UpdateHomeStatuses()
    }

    OnQuickPasteMouseWheel(wParam, lParam, msg, hwnd) {
        result := super.OnQuickPasteMouseWheel(wParam, lParam, msg, hwnd)
        if this.PocReady
            this.PositionQuickActions()
        return result
    }

    UpdateHomeStatuses() {
        count := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries.Length : 0
        PocCommandRenderer.SetSubtitle(this.Buttons["clipboard"],
            count " item" (count = 1 ? "" : "s"))
        quickStatus := "Not connected"
        if IsObject(this.ConnectionManager) && this.ConnectionManager.Credential {
            if IsObject(this.QuickPastesManager) && this.QuickPastesManager.RequestBusy
                quickStatus := "Refreshing…"
            else {
                quickCount := IsObject(this.QuickPastesManager)
                    ? this.QuickPastesManager.Items.Length : 0
                quickStatus := quickCount " saved"
            }
        }
        PocCommandRenderer.SetSubtitle(this.Buttons["quickPastes"], quickStatus)
    }

    UpdateClipboardPageTitle() {
        if !this.PocReady
            return
        count := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries.Length : 0
        this.PageTitle.Text := "Clipboard · " count " item" (count = 1 ? "" : "s")
    }

    UpdateClipboardCapacityHint() {
        if !this.PocReady
            return
        count := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries.Length : 0
        remaining := Max(0, 10 - count)
        metric(value) => Round(value * this.ScaleFactor)
        slots := Min(3, Max(0, 4 - count))
        listRows := Min(4, count)
        this.ClipboardList.Move(metric(10), metric(40), metric(276),
            count ? metric(listRows * 48 + 2) : 1)
        this.ClipboardList.Visible := this.PageKey = "clipboard" && count > 0
        for index, placeholder in this.ClipboardPlaceholders {
            visible := this.PageKey = "clipboard" && remaining > 0 && index <= slots
            PocCommandRenderer.SetTitle(placeholder, index = 1
                ? remaining " more slot" (remaining = 1 ? "" : "s") " free" : "")
            placeholder.Move(metric(10), metric(43 + count * 48 + (index - 1) * 35),
                metric(276), metric(29))
            placeholder.Visible := visible
            if visible
                DllCall("SetWindowPos", "ptr", placeholder.Hwnd, "ptr", 0,
                    "int", 0, "int", 0, "int", 0, "int", 0,
                    "uint", 0x0001 | 0x0002 | 0x0010)
        }
    }

    PositionClipboardActions() {
        if !this.PocReady
            return
        count := IsObject(this.ClipboardManager) ? this.ClipboardManager.Entries.Length : 0
        selected := this.SelectedClipboardIndex()
        visible := this.PageKey = "clipboard" && count > 0 && selected > 0
        openVisible := visible && this.ClipboardOpenButton.Enabled
        this.ClipboardOpenButton.Visible := openVisible
        this.ClipboardDeleteButton.Visible := visible
        if !visible
            return
        topIndex := DllCall("SendMessageW", "ptr", this.ClipboardList.Hwnd,
            "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr")
        row := selected - 1 - topIndex
        if row < 0 || row > 3 {
            this.ClipboardOpenButton.Visible := false
            this.ClipboardDeleteButton.Visible := false
            return
        }
        metric(value) => Round(value * this.ScaleFactor)
        y := metric(53 + row * 48)
        this.ClipboardOpenButton.Move(metric(226), y, metric(22), metric(22))
        this.ClipboardDeleteButton.Move(metric(254), y, metric(22), metric(22))
        controls := [this.BackButton, this.ClipboardClearButton, this.ClipboardList]
        if openVisible
            controls.Push(this.ClipboardOpenButton)
        controls.Push(this.ClipboardDeleteButton)
        this.Navigation.Controls := controls
    }

    PositionQuickActions() {
        if !this.PocReady
            return
        selected := this.SelectedQuickPasteIndex()
        hasCredential := IsObject(this.ConnectionManager)
            && !!this.ConnectionManager.Credential
        visible := this.PageKey = "quickPastes" && hasCredential
            && this.QuickVisibleItems.Length && selected
        this.QuickCopyButton.Visible := visible
        this.QuickPasteButton.Visible := visible
        if !visible
            return
        topIndex := DllCall("SendMessageW", "ptr", this.QuickPasteList.Hwnd,
            "uint", 0x018E, "uptr", 0, "ptr", 0, "ptr")
        row := selected - 1 - topIndex
        if row < 0 || row > 2 {
            this.QuickCopyButton.Visible := false
            this.QuickPasteButton.Visible := false
            return
        }
        metric(value) => Round(value * this.ScaleFactor)
        y := metric(90 + row * 50)
        this.QuickCopyButton.Move(metric(226), y, metric(22), metric(22))
        this.QuickPasteButton.Move(metric(254), y, metric(22), metric(22))
    }

    SetCompactItemHeight(control, baseHeight) {
        if !this.PocReady
            return
        dpi := DllCall("GetDpiForWindow", "ptr", this.Gui.Hwnd, "uint")
        if !dpi
            dpi := 96
        height := Round(baseHeight * this.ScaleFactor * dpi / 96)
        DllCall("SendMessageW", "ptr", control.Hwnd,
            "uint", 0x01A0, "uptr", 0, "ptr", height)
        count := DllCall("SendMessageW", "ptr", control.Hwnd,
            "uint", 0x018B, "uptr", 0, "ptr", 0, "ptr") ; LB_GETCOUNT
        visibleRows := control.Hwnd = this.ClipboardList.Hwnd ? 4 : 3
        DllCall("ShowScrollBar", "ptr", control.Hwnd, "int", 1,
            "int", count > visibleRows)
    }

    ApplyPocWindowStyle() {
        try {
            borderColor := TileRenderer.ColorRef(PocCommandRenderer.Color("OuterBorder"))
            DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd,
                "uint", 34, "uint*", &borderColor, "uint", 4)
        }
    }

    HidePocChrome() {
        this.Logo.Visible := false
        this.Buttons["sendToPhone"].Visible := false
        this.Buttons["networkAnalyzer"].Visible := false
        this.SettingsLabel.Visible := false
        this.BackLabel.Visible := false
        this.PageSubtitle.Visible := false
        this.ClipboardStatus.Visible := false
        this.QuickStatus.Visible := false
        this.QuickSearchLabel.Visible := false
        this.QuickFooter.Visible := false
        this.QuickSettingsButton.Visible := false
    }
}
