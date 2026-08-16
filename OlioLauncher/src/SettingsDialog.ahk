class SettingsTooltips {
    __New(gui) {
        this.Gui := gui
        this.Buffers := []
        this.Tools := []
        this.Descriptions := []
        this.Hwnd := DllCall("CreateWindowExW", "uint", 0x8,
            "str", "tooltips_class32", "ptr", 0, "uint", 0x80000003,
            "int", 0, "int", 0, "int", 0, "int", 0,
            "ptr", gui.Hwnd, "ptr", 0, "ptr", 0, "ptr", 0, "ptr")
        if this.Hwnd {
            DllCall("SendMessageW", "ptr", this.Hwnd, "uint", 0x0418,
                "ptr", 0, "ptr", 420)
            DllCall("SetWindowPos", "ptr", this.Hwnd, "ptr", -1,
                "int", 0, "int", 0, "int", 0, "int", 0,
                "uint", 0x0001 | 0x0002 | 0x0010)
        }
    }

    Add(control, text) {
        if !this.Hwnd
            return
        textBuffer := Buffer((StrLen(text) + 1) * 2, 0)
        StrPut(text, textBuffer, "UTF-16")
        toolSize := A_PtrSize = 8 ? 72 : 48
        tool := Buffer(toolSize, 0)
        NumPut("uint", toolSize, tool, 0)
        NumPut("uint", 0x0011, tool, 4) ; TTF_IDISHWND | TTF_SUBCLASS
        NumPut("ptr", this.Gui.Hwnd, tool, 8)
        NumPut("uptr", control.Hwnd, tool, A_PtrSize = 8 ? 16 : 12)
        NumPut("ptr", textBuffer.Ptr, tool, A_PtrSize = 8 ? 48 : 36)
        this.Buffers.Push(textBuffer)
        this.Tools.Push(tool)
        this.Descriptions.Push(text)
        DllCall("SendMessageW", "ptr", this.Hwnd, "uint", 0x0432,
            "ptr", 0, "ptr", tool.Ptr)
    }

    Destroy() {
        if this.Hwnd
            try DllCall("DestroyWindow", "ptr", this.Hwnd)
        this.Hwnd := 0
        this.Tools := []
        this.Buffers := []
        this.Descriptions := []
    }
}

class SettingsRenderer {
    static Items := Map()
    static HoveredHwnd := 0
    static AnimationTimer := 0

    static Register(control, kind, title, subtitle := "", accent := 0x38BDF8,
        state := false, selected := false, enabled := true, glyph := "") {
        TileRenderer.Initialize()
        stateValue := state ? 1.0 : 0.0
        selectedValue := selected ? 1.0 : 0.0
        this.Items[control.Hwnd] := {
            Kind: kind, Title: title, Subtitle: subtitle, Accent: accent,
            State: !!state, Selected: !!selected, Enabled: !!enabled,
            Glyph: glyph, Value: "", HoverProgress: 0.0, HoverTarget: 0.0,
            StateProgress: stateValue, StateTarget: stateValue,
            SelectedProgress: selectedValue, SelectedTarget: selectedValue
        }
        control.Enabled := enabled
    }

    static SetState(control, state) {
        if !this.Items.Has(control.Hwnd)
            return
        item := this.Items[control.Hwnd]
        item.State := !!state
        item.StateTarget := item.State ? 1.0 : 0.0
        control.Text := item.Title " - " (item.State ? "On" : "Off")
        this.StartAnimation(item, control.Hwnd)
    }

    static SetSelected(control, selected) {
        if !IsObject(control) || !this.Items.Has(control.Hwnd)
            return
        item := this.Items[control.Hwnd]
        item.Selected := !!selected
        item.SelectedTarget := item.Selected ? 1.0 : 0.0
        this.StartAnimation(item, control.Hwnd)
    }

    static SetValue(control, value) {
        if !this.Items.Has(control.Hwnd)
            return
        this.Items[control.Hwnd].Value := value
        DllCall("InvalidateRect", "ptr", control.Hwnd, "ptr", 0, "int", true)
    }

    static SetEnabled(control, enabled) {
        if !this.Items.Has(control.Hwnd)
            return
        item := this.Items[control.Hwnd]
        item.Enabled := !!enabled
        control.Enabled := enabled
        DllCall("InvalidateRect", "ptr", control.Hwnd, "ptr", 0, "int", true)
    }

    static StartAnimation(item, hwnd) {
        if ThemeManager.ReducedMotion {
            item.HoverProgress := item.HoverTarget
            item.StateProgress := item.StateTarget
            item.SelectedProgress := item.SelectedTarget
            DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
            return
        }
        if !IsObject(this.AnimationTimer)
            this.AnimationTimer := ObjBindMethod(this, "AnimateFrame")
        SetTimer(this.AnimationTimer, 16)
        DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", true)
    }

    static AnimateFrame(*) {
        active := false
        for hwnd, item in this.Items {
            changed := false
            for pair in [
                ["HoverProgress", "HoverTarget"],
                ["StateProgress", "StateTarget"],
                ["SelectedProgress", "SelectedTarget"]
            ] {
                current := item.%pair[1]%
                target := item.%pair[2]%
                if Abs(target - current) < 0.015
                    item.%pair[1]% := target
                else {
                    item.%pair[1]% := current + (target - current) * 0.34
                    changed := true
                    active := true
                }
            }
            if changed
                try DllCall("InvalidateRect", "ptr", hwnd, "ptr", 0, "int", false)
        }
        if !active && IsObject(this.AnimationTimer)
            SetTimer(this.AnimationTimer, 0)
    }

    static Unregister(control) {
        hwnd := IsObject(control) ? control.Hwnd : control
        if this.Items.Has(hwnd)
            this.Items.Delete(hwnd)
        if this.HoveredHwnd = hwnd
            this.HoveredHwnd := 0
        if !this.Items.Count && IsObject(this.AnimationTimer)
            SetTimer(this.AnimationTimer, 0)
    }

    static DrawItem(drawInfo) {
        if NumGet(drawInfo, 0, "uint") != 4
            return false
        hwndOffset := A_PtrSize = 8 ? 24 : 20
        itemHwnd := NumGet(drawInfo, hwndOffset, "ptr")
        if !this.Items.Has(itemHwnd)
            return false
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
        dpi := TileRenderer.WindowDpi(itemHwnd)
        accent := ThemeManager.HighContrast ? ThemeManager.Color("Text") : item.Accent

        switch item.Kind {
            case "brand":
                this.DrawBrand(hdc, left, top, right, bottom, dpi)
            case "sidebarHint":
                this.DrawSidebarHint(hdc, left, top, right, bottom, dpi)
            case "nav":
                this.DrawNavigation(hdc, item, left, top, right, bottom, dpi,
                    focused, disabled, accent)
            case "toggle":
                this.DrawToggle(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, accent)
            case "segment":
                this.DrawSegment(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, accent)
            case "placement":
                this.DrawPlacement(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, accent)
            case "hotkey":
                this.DrawHotkey(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, accent)
            case "danger":
                this.DrawAction(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, 0xF87171, false)
            default:
                this.DrawAction(hdc, item, left, top, right, bottom, dpi,
                    focused, pressed, disabled, accent, item.Selected)
        }
        return true
    }

    static DrawBrand(hdc, left, top, right, bottom, dpi) {
        background := ThemeManager.Color("Sidebar", ThemeManager.Color("Window"))
        TileRenderer.FillRect(hdc, left, top, right, bottom, background)
        brandFont := TileRenderer.CreateFont(16, 700, dpi,
            "Segoe UI Variable Display")
        captionFont := TileRenderer.CreateFont(8, 400, dpi)
        try {
            TileRenderer.DrawText(hdc, "Olio", brandFont, ThemeManager.Color("Text"),
                left, top, right, top + Round(29 * dpi / 96))
            TileRenderer.DrawText(hdc, "LAUNCHER SETTINGS", captionFont,
                ThemeManager.Color("MutedText"), left, top + Round(27 * dpi / 96),
                right, bottom)
        } finally {
            DllCall("DeleteObject", "ptr", brandFont)
            DllCall("DeleteObject", "ptr", captionFont)
        }
    }

    static DrawSidebarHint(hdc, left, top, right, bottom, dpi) {
        TileRenderer.FillRect(hdc, left, top, right, bottom,
            ThemeManager.Color("Sidebar", ThemeManager.Color("Window")))
        font := TileRenderer.CreateFont(8, 400, dpi)
        try TileRenderer.DrawText(hdc, "Every change saves`nautomatically.", font,
            ThemeManager.Color("MutedText"), left, top, right, bottom,
            0x00000010 | 0x00000800)
        finally DllCall("DeleteObject", "ptr", font)
    }

    static DrawNavigation(hdc, item, left, top, right, bottom, dpi,
        focused, disabled, accent) {
        base := ThemeManager.Color("Sidebar", ThemeManager.Color("Window"))
        hoverColor := ThemeManager.Color("SurfaceHover")
        selectedColor := ThemeManager.Color("SurfaceSelected")
        background := TileRenderer.BlendRgb(hoverColor, base, item.HoverProgress)
        background := TileRenderer.BlendRgb(selectedColor, background,
            item.SelectedProgress)
        TileRenderer.FillRect(hdc, left, top, right, bottom, base)
        TileRenderer.FillRounded(hdc, left, top, right, bottom,
            Round(10 * dpi / 96), background)
        railWidth := Max(3, Round(3 * dpi / 96))
        railHeight := Round((14 + 16 * item.SelectedProgress) * dpi / 96)
        railTop := top + Floor((bottom - top - railHeight) / 2)
        if item.SelectedProgress > 0.02
            TileRenderer.FillRounded(hdc, left, railTop, left + railWidth,
                railTop + railHeight, railWidth, accent)
        iconColor := disabled ? ThemeManager.Color("DisabledText")
            : TileRenderer.BlendRgb(accent, ThemeManager.Color("MutedText"),
                item.SelectedProgress)
        iconFont := TileRenderer.CreateFont(11, 400, dpi, "Segoe Fluent Icons")
        textFont := TileRenderer.CreateFont(9, item.Selected ? 600 : 400, dpi)
        try {
            TileRenderer.DrawText(hdc, item.Glyph, iconFont, iconColor,
                left + Round(14 * dpi / 96), top,
                left + Round(42 * dpi / 96), bottom)
            TileRenderer.DrawText(hdc, item.Title, textFont,
                disabled ? ThemeManager.Color("DisabledText")
                    : ThemeManager.Color("Text"),
                left + Round(44 * dpi / 96), top, right - Round(8 * dpi / 96), bottom,
                0x00000004 | 0x00000020 | 0x00000800)
        } finally {
            DllCall("DeleteObject", "ptr", iconFont)
            DllCall("DeleteObject", "ptr", textFont)
        }
        if focused && !disabled
            TileRenderer.StrokeRounded(hdc, left + 1, top + 1, right - 1,
                bottom - 1, Round(10 * dpi / 96), accent,
                Max(2, Round(2 * dpi / 96)))
    }

    static DrawToggle(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent) {
        this.DrawRowBackground(hdc, item, left, top, right, bottom, dpi,
            focused, pressed, disabled, accent)
        titleFont := TileRenderer.CreateFont(10, 600, dpi)
        subtitleFont := TileRenderer.CreateFont(8, 400, dpi)
        textLeft := left + Round(16 * dpi / 96)
        textRight := right - Round(82 * dpi / 96)
        try {
            TileRenderer.DrawText(hdc, item.Title, titleFont,
                disabled ? ThemeManager.Color("DisabledText") : ThemeManager.Color("Text"),
                textLeft, top + Round(7 * dpi / 96), textRight,
                top + Round(31 * dpi / 96))
            if item.Subtitle
                TileRenderer.DrawText(hdc, item.Subtitle, subtitleFont,
                    disabled ? ThemeManager.Color("DisabledText")
                        : ThemeManager.Color("MutedText"),
                    textLeft, top + Round(29 * dpi / 96), textRight,
                    bottom - Round(5 * dpi / 96), 0x00000010 | 0x00000800)
        } finally {
            DllCall("DeleteObject", "ptr", titleFont)
            DllCall("DeleteObject", "ptr", subtitleFont)
        }
        switchWidth := Round(42 * dpi / 96)
        switchHeight := Round(22 * dpi / 96)
        switchRight := right - Round(16 * dpi / 96)
        switchLeft := switchRight - switchWidth
        switchTop := top + Floor((bottom - top - switchHeight) / 2)
        offColor := ThemeManager.Color("DisabledSurface")
        switchColor := disabled ? offColor
            : TileRenderer.BlendRgb(accent, offColor, item.StateProgress)
        TileRenderer.FillRounded(hdc, switchLeft, switchTop, switchRight,
            switchTop + switchHeight, switchHeight, switchColor)
        knobSize := switchHeight - Round(6 * dpi / 96)
        travel := switchWidth - knobSize - Round(6 * dpi / 96)
        knobLeft := switchLeft + Round(3 * dpi / 96)
            + Round(travel * item.StateProgress)
        TileRenderer.FillRounded(hdc, knobLeft, switchTop + Round(3 * dpi / 96),
            knobLeft + knobSize, switchTop + Round(3 * dpi / 96) + knobSize,
            knobSize, disabled ? ThemeManager.Color("DisabledText") : 0xFFFFFF)
    }

    static DrawSegment(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent) {
        base := ThemeManager.Color("SurfaceElevated", ThemeManager.Color("Surface"))
        hover := ThemeManager.Color("SurfaceHover")
        selected := accent
        background := TileRenderer.BlendRgb(hover, base, item.HoverProgress)
        background := TileRenderer.BlendRgb(selected, background,
            item.SelectedProgress)
        if pressed
            background := ThemeManager.Color("SurfacePressed")
        TileRenderer.FillRect(hdc, left, top, right, bottom, ThemeManager.Color("Window"))
        TileRenderer.FillRounded(hdc, left, top, right, bottom,
            Round(9 * dpi / 96), background)
        border := focused ? accent : item.Selected
            ? accent : ThemeManager.Color("MutedBorder")
        TileRenderer.StrokeRounded(hdc, left + 1, top + 1, right - 1, bottom - 1,
            Round(9 * dpi / 96), border, focused ? Max(2, Round(2 * dpi / 96)) : 1)
        font := TileRenderer.CreateFont(9, item.Selected ? 600 : 400, dpi)
        try TileRenderer.DrawText(hdc, item.Title, font,
            disabled ? ThemeManager.Color("DisabledText")
                : item.Selected ? ThemeManager.Color("Window") : ThemeManager.Color("Text"),
            left, top, right, bottom,
            0x00000001 | 0x00000004 | 0x00000020 | 0x00000800)
        finally DllCall("DeleteObject", "ptr", font)
    }

    static DrawPlacement(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent) {
        base := ThemeManager.Color("SurfaceElevated", ThemeManager.Color("Surface"))
        selected := TileRenderer.BlendRgb(accent, base, 0.22)
        background := TileRenderer.BlendRgb(selected, base, item.SelectedProgress)
        if pressed
            background := ThemeManager.Color("SurfacePressed")
        TileRenderer.FillRect(hdc, left, top, right, bottom, ThemeManager.Color("Window"))
        TileRenderer.FillRounded(hdc, left, top, right, bottom,
            Round(7 * dpi / 96), background)
        border := item.Selected ? accent : ThemeManager.Color("MutedBorder")
        TileRenderer.StrokeRounded(hdc, left + 1, top + 1, right - 1, bottom - 1,
            Round(7 * dpi / 96), focused ? accent : border,
            focused ? Max(2, Round(2 * dpi / 96)) : 1)
        markerSize := Round(7 * dpi / 96)
        markerLeft := left + Floor((right - left - markerSize) / 2)
        markerTop := top + Floor((bottom - top - markerSize) / 2)
        TileRenderer.FillRounded(hdc, markerLeft, markerTop,
            markerLeft + markerSize, markerTop + markerSize, markerSize,
            disabled ? ThemeManager.Color("DisabledText")
                : item.Selected ? accent : ThemeManager.Color("MutedText"))
    }

    static DrawHotkey(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent) {
        this.DrawRowBackground(hdc, item, left, top, right, bottom, dpi,
            focused, pressed, disabled, accent)
        titleFont := TileRenderer.CreateFont(10, 600, dpi)
        subtitleFont := TileRenderer.CreateFont(8, 400, dpi)
        valueFont := TileRenderer.CreateFont(9, 600, dpi)
        try {
            TileRenderer.DrawText(hdc, item.Title, titleFont, ThemeManager.Color("Text"),
                left + Round(16 * dpi / 96), top + Round(7 * dpi / 96),
                right - Round(240 * dpi / 96), top + Round(31 * dpi / 96))
            TileRenderer.DrawText(hdc, item.Subtitle, subtitleFont,
                ThemeManager.Color("MutedText"), left + Round(16 * dpi / 96),
                top + Round(30 * dpi / 96), right - Round(240 * dpi / 96),
                bottom - Round(5 * dpi / 96), 0x00000010 | 0x00000800)
            pillLeft := right - Round(218 * dpi / 96)
            pillTop := top + Round(13 * dpi / 96)
            pillBottom := bottom - Round(13 * dpi / 96)
            TileRenderer.FillRounded(hdc, pillLeft, pillTop,
                right - Round(14 * dpi / 96), pillBottom,
                Round(8 * dpi / 96), ThemeManager.Color("Input"))
            TileRenderer.StrokeRounded(hdc, pillLeft + 1, pillTop + 1,
                right - Round(15 * dpi / 96), pillBottom - 1,
                Round(8 * dpi / 96), focused ? accent : ThemeManager.Color("Border"),
                focused ? Max(2, Round(2 * dpi / 96)) : 1)
            TileRenderer.DrawText(hdc, item.Value, valueFont,
                disabled ? ThemeManager.Color("DisabledText") : ThemeManager.Color("Text"),
                pillLeft + Round(10 * dpi / 96), pillTop,
                right - Round(24 * dpi / 96), pillBottom,
                0x00000001 | 0x00000004 | 0x00000020 | 0x00000800)
        } finally {
            DllCall("DeleteObject", "ptr", titleFont)
            DllCall("DeleteObject", "ptr", subtitleFont)
            DllCall("DeleteObject", "ptr", valueFont)
        }
    }

    static DrawAction(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent, primary) {
        base := primary ? accent : ThemeManager.Color("SurfaceElevated",
            ThemeManager.Color("Surface"))
        hover := primary ? TileRenderer.BlendRgb(0xFFFFFF, accent, 0.14)
            : ThemeManager.Color("SurfaceHover")
        background := TileRenderer.BlendRgb(hover, base, item.HoverProgress)
        if pressed
            background := primary ? TileRenderer.BlendRgb(0x000000, accent, 0.12)
                : ThemeManager.Color("SurfacePressed")
        if disabled
            background := ThemeManager.Color("DisabledSurface")
        TileRenderer.FillRect(hdc, left, top, right, bottom, ThemeManager.Color("Window"))
        TileRenderer.FillRounded(hdc, left, top, right, bottom,
            Round(9 * dpi / 96), background)
        border := focused ? accent : primary ? accent : ThemeManager.Color("MutedBorder")
        TileRenderer.StrokeRounded(hdc, left + 1, top + 1, right - 1, bottom - 1,
            Round(9 * dpi / 96), border, focused ? Max(2, Round(2 * dpi / 96)) : 1)
        font := TileRenderer.CreateFont(9, 600, dpi)
        try TileRenderer.DrawText(hdc, item.Title, font,
            disabled ? ThemeManager.Color("DisabledText")
                : primary ? ThemeManager.Color("Window")
                : item.Kind = "danger" ? 0xF87171 : ThemeManager.Color("Text"),
            left, top, right, bottom,
            0x00000001 | 0x00000004 | 0x00000020 | 0x00000800)
        finally DllCall("DeleteObject", "ptr", font)
    }

    static DrawRowBackground(hdc, item, left, top, right, bottom, dpi,
        focused, pressed, disabled, accent) {
        base := ThemeManager.Color("SurfaceElevated", ThemeManager.Color("Surface"))
        background := TileRenderer.BlendRgb(ThemeManager.Color("SurfaceHover"), base,
            item.HoverProgress)
        if pressed
            background := ThemeManager.Color("SurfacePressed")
        if disabled
            background := ThemeManager.Color("DisabledSurface")
        TileRenderer.FillRect(hdc, left, top, right, bottom, ThemeManager.Color("Window"))
        TileRenderer.FillRounded(hdc, left, top, right, bottom,
            Round(11 * dpi / 96), background)
        border := focused ? accent : ThemeManager.Color("MutedBorder")
        TileRenderer.StrokeRounded(hdc, left + 1, top + 1, right - 1, bottom - 1,
            Round(11 * dpi / 96), border, focused ? Max(2, Round(2 * dpi / 96)) : 1)
    }

    static OnMouseMove(hwnd) {
        if !this.Items.Has(hwnd) || !this.Items[hwnd].Enabled
            return
        if this.HoveredHwnd != hwnd {
            old := this.HoveredHwnd
            this.HoveredHwnd := hwnd
            if old && this.Items.Has(old) {
                this.Items[old].HoverTarget := 0.0
                this.StartAnimation(this.Items[old], old)
            }
            this.Items[hwnd].HoverTarget := 1.0
            this.StartAnimation(this.Items[hwnd], hwnd)
        }
        tracking := Buffer(A_PtrSize = 8 ? 24 : 16, 0)
        NumPut("uint", tracking.Size, tracking, 0)
        NumPut("uint", 0x2, tracking, 4)
        NumPut("ptr", hwnd, tracking, 8)
        DllCall("TrackMouseEvent", "ptr", tracking)
    }

    static OnMouseLeave(hwnd) {
        if hwnd = this.HoveredHwnd {
            this.HoveredHwnd := 0
            if this.Items.Has(hwnd) {
                this.Items[hwnd].HoverTarget := 0.0
                this.StartAnimation(this.Items[hwnd], hwnd)
            }
        }
    }
}

class SettingsDialog {
    static LogicalWidth := 780
    static LogicalHeight := 620

    __New(parentGui, settings, applyCallback, closedCallback := 0,
        testMode := false, connectionManager := 0, calendarManager := 0) {
        this.ParentGui := parentGui
        this.Settings := settings
        this.ApplyCallback := applyCallback
        this.ClosedCallback := closedCallback
        this.ConnectionManager := connectionManager
        this.CalendarManager := calendarManager
        this.Closed := false
        this.TestMode := testMode
        this.Loading := true
        this.PendingSave := false
        this.RevertFailedSave := false
        this.CurrentSection := "general"
        this.AccessibleNames := Map()
        this.TextControls := []
        this.MutedTextControls := []
        this.SurfaceControls := []
        this.InputControls := []
        this.DrawnControls := []
        this.ActionCallbacks := Map()
        this.Pages := Map("general", [], "behavior", [], "clipboard", [],
            "appearance", [], "account", [], "advanced", [])
        this.PageLayouts := Map()
        this.Tabs := Map()
        this.ToggleValues := Map()
        this.ToggleControls := Map()
        this.SegmentControls := Map()
        this.PlacementControls := []
        this.OpeningPositionValue := "middle-right"
        this.AutoSaveTimer := ObjBindMethod(this, "AutoSave")
        this.PageAnimationTimer := ObjBindMethod(this, "AnimatePageFrame")
        this.StatusHideTimer := ObjBindMethod(this, "HideSavedStatus")
        this.Gui := Gui("", "Olio Launcher Settings")
        this.Gui.MarginX := 0
        this.Gui.MarginY := 0
        this.Gui.OnEvent("Close", (*) => this.Close())
        this.Gui.OnEvent("Escape", (*) => this.Close())
        this.CommandHandler := ObjBindMethod(this, "OnCommand")
        OnMessage(0x0111, this.CommandHandler)
        this.Tooltips := SettingsTooltips(this.Gui)
        this.CreateControls()
        this.LoadValues(settings)
        this.ApplyTheme()
        this.ShowSection(this.InitialSection())
        this.Show()
        this.Loading := false
    }

    CreateControls() {
        this.SidebarSurface := this.Gui.AddText("x175 y0 w1 h620")
        this.SurfaceControls.Push({Control: this.SidebarSurface, Color: "MutedBorder"})
        this.Brand := this.Gui.Add("Custom",
            "ClassButton x20 y18 w136 h48 0x5400000B", "Olio Launcher settings")
        this.DrawnControls.Push(this.Brand)
        SettingsRenderer.Register(this.Brand, "brand", "Olio")
        this.BrandSubtitle := this.Brand

        navItems := [
            {Key: "general", Text: "General", Glyph: Chr(0xE713)},
            {Key: "behavior", Text: "Behavior", Glyph: Chr(0xE8A7)},
            {Key: "clipboard", Text: "Clipboard", Glyph: Chr(0xE8C8)},
            {Key: "appearance", Text: "Appearance", Glyph: Chr(0xE771)},
            {Key: "account", Text: "Account", Glyph: Chr(0xE77B)},
            {Key: "advanced", Text: "Advanced", Glyph: Chr(0xE712)}
        ]
        y := 84
        for item in navItems {
            button := this.AddDrawnButton("x16 y" y " w144 h44", "nav",
                item.Text, "", ThemeManager.Color("Accent", 0x38BDF8),
                item.Text " settings", item.Glyph)
            this.BindAction(button, ObjBindMethod(this, "ShowSection", item.Key))
            this.Tabs[item.Key] := button
            y += 48
        }
        this.SidebarHint := this.Gui.Add("Custom",
            "ClassButton x20 y558 w136 h42 0x5400000B",
            "Every change saves automatically.")
        this.DrawnControls.Push(this.SidebarHint)
        SettingsRenderer.Register(this.SidebarHint, "sidebarHint",
            "Every change saves automatically.")

        this.Gui.SetFont("s9 norm", "Segoe UI Variable Text")
        this.Status := this.AddText("x626 y34 w122 h22 +Right", "")
        this.InlineStatus := this.AddText("x208 y576 w540 h24 +Wrap Hidden", "")

        this.CreateGeneralPage()
        this.CreateBehaviorPage()
        this.CreateClipboardPage()
        this.CreateAppearancePage()
        this.CreateAccountPage()
        this.CreateAdvancedPage()
    }

    CreateGeneralPage() {
        page := "general"
        this.PageHeading(page, "General", "The essentials for starting and opening Olio.")
        this.FocusKeyRecorder := this.PageControl(page,
            this.AddDrawnButton("x208 y112 w540 h82", "hotkey", "Focus shortcut",
                "Select this row, then press the keys you want to use.",
                ThemeManager.Color("Accent", 0x38BDF8), "Record Focus Key shortcut"))
        this.BindAction(this.FocusKeyRecorder, (*) => this.RecordFocusKey())
        this.Tooltips.Add(this.FocusKeyRecorder,
            "Opens or hides the launcher. Press the shortcut twice quickly to start Dynamic Screenshot.")
        this.FocusKeyError := this.PageText(page, "x224 y198 w508 h22", "")
        this.StartWithWindowsCheck := this.CreateToggle(page,
            "x208 y230 w540 h72", "startWithWindows", "Open when I sign in",
            "Starts for your Windows account without administrator access.",
            "Starts Olio Launcher after you sign in using a per-user Windows startup entry.")

        this.FocusKeyEdit := this.Gui.AddEdit("x-10000 y-10000 w1 h1 Hidden", "")
        this.InputControls.Push(this.FocusKeyEdit)
        this.Name(this.FocusKeyEdit, "Focus Key value")
        this.TestFocusKeyButton := this.FocusKeyRecorder
    }

    CreateBehaviorPage() {
        page := "behavior"
        this.PageHeading(page, "Launcher behavior",
            "Choose where Olio appears and what happens after an action.")

        this.PageLabel(page, "x208 y106 w180 h20", "Open on")
        this.MonitorList := this.HiddenList(["Active monitor", "Primary monitor",
            "Remembered monitor"], "Opening monitor")
        this.CreateSegmentGroup(page, "openingMonitor", 208, 130, 540,
            ["Active monitor", "Primary monitor", "Remembered"],
            ["active", "primary", "remembered"], this.MonitorList)

        this.PageLabel(page, "x208 y180 w220 h20", "Opening position")
        positionHelp := this.PageText(page, "x208 y208 w274 h56 +Wrap",
            "Olio is designed to sit against the right edge without covering the center of your work.")
        this.MutedTextControls.Push(positionHelp)
        this.CreatePlacementPicker(page, 538, 202)
        this.PositionList := this.HiddenList([
            "Upper right", "Middle right"], "Opening position")

        this.PageLabel(page, "x208 y294 w180 h20", "Launcher scale")
        this.ScaleList := this.PageControl(page, this.Gui.AddDropDownList(
            "x208 y318 w540 Choose2", ["Compact - 90%", "Standard - 100%", "Large - 115%"]))
        this.Name(this.ScaleList, "Launcher scale")
        this.InputControls.Push(this.ScaleList)
        this.RegisterAutoSave(this.ScaleList, true)
        this.Tooltips.Add(this.ScaleList,
            "Changes the overall launcher size while preserving its proportions.")

        this.AlwaysOnTopCheck := this.CreateToggle(page,
            "x208 y370 w264 h64", "alwaysOnTop", "Always on top",
            "Keep Olio above other apps.",
            "Keeps the launcher visible above ordinary windows while it is open.")
        this.CloseOnFocusLostCheck := this.CreateToggle(page,
            "x484 y370 w264 h64", "closeOnFocusLost", "Hide on click away",
            "Close when focus moves away.",
            "The separate Settings window stays open.")
        this.HideOnClickAwayCheck := this.CloseOnFocusLostCheck
        this.CloseAfterSelectionCheck := this.CreateToggle(page,
            "x208 y446 w264 h64", "closeAfterSelection", "Hide after choosing",
            "Close after a successful copy.",
            "Applies to successful mouse and keyboard selections.")
        this.AutoPasteCheck := this.CreateToggle(page,
            "x484 y446 w264 h64", "autoPasteAfterSelection", "Paste automatically",
            "Paste into the previous app.",
            "Pastes only into the previously active app. If Windows blocks the target, the item remains copied for manual paste.")
    }

    CreateClipboardPage() {
        page := "clipboard"
        this.PageHeading(page, "Clipboard",
            "Control capture without changing the items already in memory.")
        this.ClipboardPausedCheck := this.CreateToggle(page,
            "x208 y112 w540 h72", "clipboardPaused", "Pause Clipboard History",
            "Stop new capture. Existing Clipboard History and Quick Paste items still work.",
            "Pausing never removes existing items and does not block deliberate copy or paste.")

        this.PageLabel(page, "x208 y210 w320 h22", "Apps ignored by Clipboard History")
        this.ClipboardAppsHelp := this.PageText(page, "x208 y234 w540 h36 +Wrap",
            "Olio stores only executable names. Content copied while one of these apps is active is ignored.")
        this.MutedTextControls.Push(this.ClipboardAppsHelp)
        this.SensitiveList := this.PageControl(page,
            this.Gui.AddListBox("x208 y282 w388 h218", []))
        this.Name(this.SensitiveList, "Apps ignored by Clipboard History")
        this.InputControls.Push(this.SensitiveList)
        this.Tooltips.Add(this.SensitiveList,
            "Content copied while a listed executable is active is not added to Clipboard History.")
        this.AddSensitiveButton := this.PageControl(page,
            this.AddDrawnButton("x608 y282 w140 h36", "action", "Add app", "",
                ThemeManager.Color("Accent", 0x38BDF8), "Add an ignored application"))
        SettingsRenderer.SetSelected(this.AddSensitiveButton, true)
        this.RemoveSensitiveButton := this.PageControl(page,
            this.AddDrawnButton("x608 y326 w140 h36", "action", "Remove", "",
                ThemeManager.Color("Accent", 0x38BDF8), "Remove selected ignored application"))
        this.BindAction(this.AddSensitiveButton, (*) => this.ChooseSensitiveExecutable())
        this.BindAction(this.RemoveSensitiveButton, (*) => this.RemoveSensitiveExecutable())
        this.Tooltips.Add(this.AddSensitiveButton,
            "Choose a Windows .exe file. Only its file name is stored.")
        this.Tooltips.Add(this.RemoveSensitiveButton,
            "Remove the selected executable from the ignored-app list.")
        this.SensitiveEdit := this.Gui.AddEdit("x-10000 y-10000 w1 h1 Hidden", "")
        this.InputControls.Push(this.SensitiveEdit)
    }

    CreateAppearancePage() {
        page := "appearance"
        this.PageHeading(page, "Appearance",
            "Match Windows or choose the Olio look you prefer.")
        this.PageLabel(page, "x208 y112 w180 h20", "Color mode")
        this.ThemeList := this.HiddenList(["Follow Windows", "Dark", "Light"],
            "Launcher appearance")
        this.CreateSegmentGroup(page, "theme", 208, 138, 540,
            ["Follow Windows", "Dark", "Light"], ["system", "dark", "light"],
            this.ThemeList)
        this.AppearanceHelp := this.PageText(page, "x208 y188 w540 h34 +Wrap",
            "High contrast always follows Windows system colors. Motion is minimized throughout the launcher.")
        this.MutedTextControls.Push(this.AppearanceHelp)
    }

    CreateAccountPage() {
        page := "account"
        this.PageHeading(page, "Account", "Connect this Windows device to Olio Workstation.")
        this.PageLabel(page, "x208 y112 w220 h20", "Device name")
        this.DeviceNameEdit := this.PageControl(page,
            this.Gui.AddEdit("x208 y138 w540 h34", ""))
        this.Name(this.DeviceNameEdit, "Olio Launcher device name")
        this.InputControls.Push(this.DeviceNameEdit)
        this.Tooltips.Add(this.DeviceNameEdit,
            "Name shown for this launcher in Olio Workstation. It contains no account name or email.")
        this.RegisterAutoSave(this.DeviceNameEdit)

        this.ConnectionSurface := this.PageText(page, "x208 y202 w540 h196", "")
        this.SurfaceControls.Push({Control: this.ConnectionSurface, Color: "SurfaceElevated"})
        this.ConnectionEyebrow := this.PageText(page, "x232 y224 w492 h20", "CONNECTION STATUS")
        this.MutedTextControls.Push(this.ConnectionEyebrow)
        this.ConnectionStatus := this.PageText(page,
            "x232 y254 w492 h62 +Wrap", "Connect without entering your Olio password.")
        connectionHelp := "Connection uses one-time browser approval. The protected device credential stays in Windows Credential Manager, not settings."
        this.Tooltips.Add(this.ConnectionStatus, connectionHelp)
        this.AccountNote := this.PageText(page, "x232 y412 w492 h44 +Wrap",
            "Resetting launcher settings never disconnects this device.")
        this.MutedTextControls.Push(this.AccountNote)

        this.CalendarEyebrow := this.PageText(page, "x232 y468 w190 h20", "TODAY'S SCHEDULE")
        this.MutedTextControls.Push(this.CalendarEyebrow)
        this.CalendarStatus := this.PageText(page, "x232 y494 w320 h44 +Wrap",
            "Calendar has not been refreshed yet.")
        this.MutedTextControls.Push(this.CalendarStatus)
        this.CalendarRefreshButton := this.PageControl(page,
            this.AddDrawnButton("x570 y486 w154 h40", "action", "Refresh schedule", "",
                0xF59E0B, "Refresh today's Google Calendar schedule"))
        this.BindAction(this.CalendarRefreshButton, (*) => this.RefreshCalendarNow())

        this.ConnectButton := this.PageControl(page,
            this.AddDrawnButton("x232 y334 w492 h40", "action", "Connect Olio account", "",
                ThemeManager.Color("Accent", 0x38BDF8), "Connect an Olio account"))
        SettingsRenderer.SetSelected(this.ConnectButton, true)
        this.CancelConnectionButton := this.PageControl(page,
            this.AddDrawnButton("x232 y334 w492 h40", "action", "Cancel connection", "",
                0xF59E0B, "Cancel Olio account connection"))
        this.RetryConnectionButton := this.PageControl(page,
            this.AddDrawnButton("x232 y334 w238 h40", "action", "Retry", "",
                ThemeManager.Color("Accent", 0x38BDF8), "Retry Olio account connection"))
        SettingsRenderer.SetSelected(this.RetryConnectionButton, true)
        this.DisconnectButton := this.PageControl(page,
            this.AddDrawnButton("x486 y334 w238 h40", "danger", "Disconnect account", "",
                0xF87171, "Disconnect Olio account"))
        this.BindAction(this.ConnectButton, (*) => this.StartConnection())
        this.BindAction(this.CancelConnectionButton,
            (*) => this.ConnectionManager.CancelPairing())
        this.BindAction(this.RetryConnectionButton, (*) => this.ConnectionManager.Retry())
        this.BindAction(this.DisconnectButton, (*) => this.ConfirmDisconnect())
    }

    CreateAdvancedPage() {
        page := "advanced"
        this.PageHeading(page, "Advanced",
            "Diagnostics, privacy exclusions, and recovery controls.")
        this.DiagnosticsCheck := this.CreateToggle(page,
            "x208 y112 w540 h72", "loggingEnabled", "Troubleshooting log",
            "Save local, redacted technical events. Nothing is uploaded.",
            "Never logs credentials, identities, clipboard or Quick Paste content, screenshots, emails, headers, or request bodies.")
        this.OpenDiagnosticsButton := this.PageControl(page,
            this.AddDrawnButton("x208 y198 w188 h38", "action", "Open log folder", "",
                ThemeManager.Color("Accent", 0x38BDF8), "Open troubleshooting log folder"))
        this.BindAction(this.OpenDiagnosticsButton, (*) => this.OpenDiagnosticsFolder())
        this.PageLabel(page, "x208 y274 w320 h22", "Reset launcher")
        this.ResetHelp := this.PageText(page, "x208 y302 w540 h52 +Wrap",
            "Restore safe defaults for launcher behavior and appearance. Your Olio account connection and protected credential are preserved.")
        this.MutedTextControls.Push(this.ResetHelp)
        this.ResetButton := this.PageControl(page,
            this.AddDrawnButton("x208 y374 w188 h40", "danger", "Reset settings", "",
                0xF87171, "Reset launcher settings"))
        this.BindAction(this.ResetButton, (*) => this.ConfirmReset())
        this.Tooltips.Add(this.ResetButton,
            "Restores safe defaults while preserving the Olio account connection and protected credential.")
    }

    PageHeading(page, title, subtitle) {
        this.Gui.SetFont("s20 bold", "Segoe UI Variable Display")
        this.PageText(page, "x208 y28 w400 h38", title)
        this.Gui.SetFont("s9 norm", "Segoe UI Variable Text")
        description := this.PageText(page, "x208 y68 w510 h24", subtitle)
        this.MutedTextControls.Push(description)
    }

    PageLabel(page, options, text) {
        this.Gui.SetFont("s9 bold", "Segoe UI Variable Text")
        label := this.PageText(page, options, text)
        this.Gui.SetFont("s9 norm", "Segoe UI Variable Text")
        return label
    }

    CreateToggle(page, options, key, title, subtitle, tooltip) {
        control := this.AddDrawnButton(options, "toggle", title, subtitle,
            ThemeManager.Color("Accent", 0x38BDF8), title)
        this.PageControl(page, control)
        this.ToggleControls[key] := control
        this.BindAction(control, ObjBindMethod(this, "ToggleSetting", key, control))
        this.Tooltips.Add(control, tooltip)
        return control
    }

    CreateSegmentGroup(page, key, x, y, width, labels, values, hiddenControl) {
        gap := 8
        itemWidth := Floor((width - gap * (labels.Length - 1)) / labels.Length)
        controls := []
        Loop labels.Length {
            itemX := x + (A_Index - 1) * (itemWidth + gap)
            if A_Index = labels.Length
                itemWidth := x + width - itemX
            control := this.PageControl(page,
                this.AddDrawnButton("x" itemX " y" y " w" itemWidth " h38",
                    "segment", labels[A_Index], "",
                    ThemeManager.Color("Accent", 0x38BDF8), labels[A_Index]))
            value := values[A_Index]
            this.BindAction(control, ObjBindMethod(this, "SelectSegment", key,
                value, hiddenControl))
            help := key = "openingMonitor"
                ? "Choose which display the launcher opens on."
                : key = "openingPosition"
                    ? "Choose the edge or remembered position used when Olio opens."
                    : "Choose whether Olio follows Windows, stays dark, or stays light."
            this.Tooltips.Add(control, help)
            controls.Push({Control: control, Value: value})
        }
        this.SegmentControls[key] := controls
        return controls
    }

    CreatePlacementPicker(page, x, y) {
        positions := [
            ["top-right", "Upper right"], ["middle-right", "Middle right"]
        ]
        buttonWidth := 102, buttonHeight := 34, gap := 8
        Loop positions.Length {
            position := positions[A_Index]
            control := this.PageControl(page,
                this.AddDrawnButton("x" x
                    " y" (y + (A_Index - 1) * (buttonHeight + gap)) " w" buttonWidth
                    " h" buttonHeight, "placement", position[2], "",
                    ThemeManager.Color("Accent", 0x38BDF8),
                    "Open launcher at " position[2]))
            value := position[1]
            this.BindAction(control, ObjBindMethod(this, "SelectPlacement", value))
            this.Tooltips.Add(control, "Open the launcher at the " StrLower(position[2])
                " of the selected monitor.")
            this.PlacementControls.Push({Control: control, Value: value})
        }
    }

    HiddenList(items, accessibleName) {
        control := this.Gui.AddDropDownList("x-10000 y-10000 w1 Hidden", items)
        this.InputControls.Push(control)
        this.Name(control, accessibleName)
        return control
    }

    AddDrawnButton(options, kind, title, subtitle, accent, accessibleName,
        glyph := "") {
        button := this.Gui.Add("Custom",
            "ClassButton " options " 0x5001000B", accessibleName)
        this.DrawnControls.Push(button)
        this.Name(button, accessibleName)
        SettingsRenderer.Register(button, kind, title, subtitle, accent,
            false, false, true, glyph)
        return button
    }

    BindAction(control, callback) {
        this.ActionCallbacks[control.Hwnd] := callback
    }

    OnCommand(wParam, lParam, msg, hwnd) {
        try guiHwnd := this.Gui.Hwnd
        catch
            return
        if hwnd != guiHwnd || !lParam || ((wParam >> 16) & 0xFFFF) != 0
            return
        if this.ActionCallbacks.Has(lParam) {
            this.ActionCallbacks[lParam].Call()
            return 0
        }
    }

    PageText(page, options, text) {
        control := this.AddText(options " Hidden", text)
        return this.PageControl(page, control)
    }

    PageControl(page, control) {
        control.Visible := false
        this.Pages[page].Push(control)
        try {
            control.GetPos(&x, &y, &width, &height)
            this.PageLayouts[control.Hwnd] := {
                Control: control, X: x, Y: y, Width: width, Height: height
            }
        }
        return control
    }

    AddText(options, text) {
        control := this.Gui.AddText(options, text)
        this.TextControls.Push(control)
        return control
    }

    Name(control, accessibleName) {
        this.AccessibleNames[control.Hwnd] := accessibleName
    }

    RegisterAutoSave(control, immediate := false) {
        control.OnEvent("Change", (*) => this.QueueAutoSave(immediate))
    }

    ToggleSetting(key, control, *) {
        this.ToggleValues[key] := !this.ToggleValues[key]
        SettingsRenderer.SetState(control, this.ToggleValues[key])
        this.QueueAutoSave(true)
    }

    SelectSegment(key, value, hiddenControl, *) {
        this.SetSegmentValue(key, value)
        values := key = "openingMonitor" ? ["active", "primary", "remembered"]
            : key = "openingPosition" ? ["right", "remembered"]
            : ["system", "dark", "light"]
        for index, candidate in values {
            if candidate = value {
                hiddenControl.Choose(index)
                break
            }
        }
        this.QueueAutoSave(true)
    }

    SetSegmentValue(key, value) {
        if !this.SegmentControls.Has(key)
            return
        for item in this.SegmentControls[key]
            SettingsRenderer.SetSelected(item.Control, item.Value = value)
    }

    SelectPlacement(value, *) {
        this.SetPlacementValue(value)
        this.QueueAutoSave(true)
    }

    SetPlacementValue(value) {
        if value != "top-right" && value != "middle-right"
            value := "middle-right"
        this.OpeningPositionValue := value
        for item in this.PlacementControls
            SettingsRenderer.SetSelected(item.Control, item.Value = value)
        values := ["top-right", "middle-right"]
        for index, candidate in values {
            if candidate = value {
                this.PositionList.Choose(index)
                break
            }
        }
    }

    RecordFocusKey(*) {
        previous := this.FocusKeyEdit.Value
        SettingsRenderer.SetValue(this.FocusKeyRecorder, "Press shortcut...")
        this.FocusKeyError.Text := "Press Escape to cancel."
        this.FocusKeyError.SetFont("c" ThemeManager.Hex("MutedText"),
            "Segoe UI Variable Text")
        input := InputHook("T8")
        input.KeyOpt("{All}", "ES")
        input.KeyOpt("{LControl}{RControl}{LShift}{RShift}{LAlt}{RAlt}{LWin}{RWin}",
            "-E")
        input.Start()
        input.Wait()
        key := input.EndKey
        if !key || key = "Escape" {
            SettingsRenderer.SetValue(this.FocusKeyRecorder, this.FormatHotkey(previous))
            this.FocusKeyError.Text := key = "Escape" ? "Shortcut change canceled."
                : "No shortcut was detected. Try again."
            return false
        }
        prefix := ""
        if GetKeyState("LWin", "P") || GetKeyState("RWin", "P")
            prefix .= "#"
        if GetKeyState("LControl", "P") || GetKeyState("RControl", "P")
            prefix .= "^"
        if GetKeyState("LAlt", "P") || GetKeyState("RAlt", "P")
            prefix .= "!"
        if GetKeyState("LShift", "P") || GetKeyState("RShift", "P")
            prefix .= "+"
        candidate := prefix key
        validation := HotkeyManager.Validate(candidate)
        if !validation.Ok {
            SettingsRenderer.SetValue(this.FocusKeyRecorder, this.FormatHotkey(previous))
            this.FocusKeyError.SetFont("c" ThemeManager.Hex("ErrorText"),
                "Segoe UI Variable Text")
            this.FocusKeyError.Text := "That shortcut is reserved or unavailable."
            return false
        }
        this.FocusKeyEdit.Value := candidate
        SettingsRenderer.SetValue(this.FocusKeyRecorder, this.FormatHotkey(candidate))
        this.FocusKeyError.Text := ""
        return this.QueueAutoSave(true)
    }

    FormatHotkey(hotkey) {
        remainder := hotkey
        parts := []
        for pair in [["#", "Windows"], ["^", "Ctrl"], ["!", "Alt"], ["+", "Shift"]] {
            if InStr(remainder, pair[1]) {
                parts.Push(pair[2])
                remainder := StrReplace(remainder, pair[1], "")
            }
        }
        keyName := GetKeyName(remainder)
        parts.Push(keyName ? keyName : remainder)
        result := ""
        for part in parts
            result .= (result ? " + " : "") part
        return result
    }

    ChooseSensitiveExecutable(*) {
        selected := FileSelect(3, , "Choose an app to ignore", "Programs (*.exe)")
        if !selected
            return false
        SplitPath(selected, &fileName)
        return this.AddSensitiveExecutableName(fileName)
    }

    AddSensitiveExecutableName(fileName) {
        current := this.SensitiveEdit.Value
        candidateText := current ? current ";" fileName : fileName
        normalized := SettingsManager.NormalizeSensitiveApplications(candidateText)
        if !normalized.Ok {
            this.SetStatus("Choose a Windows application ending in .exe.", true)
            return false
        }
        if normalized.Value = current {
            this.SetStatus("That app is already ignored.", true)
            return false
        }
        this.SensitiveEdit.Value := normalized.Value
        this.RefreshSensitiveList()
        this.QueueAutoSave(true)
        return true
    }

    RemoveSensitiveExecutable(*) {
        selectedIndex := this.SensitiveList.Value
        if !selectedIndex {
            this.SetStatus("Select an app to remove.", true)
            return false
        }
        items := this.SensitiveItems()
        items.RemoveAt(selectedIndex)
        value := ""
        for item in items
            value .= (value ? ";" : "") item
        this.SensitiveEdit.Value := value
        this.RefreshSensitiveList()
        this.QueueAutoSave(true)
        return true
    }

    OpenDiagnosticsFolder(*) {
        logDir := SettingsManager.SettingsDir "\logs"
        try DirCreate(logDir)
        try Run('explorer.exe "' logDir '"')
        catch {
            this.SetStatus("The troubleshooting log folder could not be opened.", true)
            return false
        }
        return true
    }

    SensitiveItems() {
        value := Trim(this.SensitiveEdit.Value)
        return value ? StrSplit(value, ";") : []
    }

    RefreshSensitiveList() {
        this.SensitiveList.Delete()
        items := this.SensitiveItems()
        if items.Length
            this.SensitiveList.Add(items)
        SettingsRenderer.SetEnabled(this.RemoveSensitiveButton, items.Length > 0)
    }

    LoadValues(settings) {
        this.Loading := true
        this.Settings := settings
        this.FocusKeyEdit.Value := settings["focusKey"]
        SettingsRenderer.SetValue(this.FocusKeyRecorder,
            this.FormatHotkey(settings["focusKey"]))
        themeIndex := Map("system", 1, "dark", 2, "light", 3)[settings["theme"]]
        this.ThemeList.Choose(themeIndex)
        this.SetSegmentValue("theme", settings["theme"])
        monitorIndex := Map("active", 1, "primary", 2,
            "remembered", 3)[settings["openingMonitor"]]
        this.MonitorList.Choose(monitorIndex)
        this.SetSegmentValue("openingMonitor", settings["openingMonitor"])
        this.SetPlacementValue(settings["openingPosition"])
        this.ScaleList.Choose(Map("compact", 1, "standard", 2,
            "large", 3)[settings["launcherScale"]])
        this.SensitiveEdit.Value := settings["sensitiveApplications"]
        this.DeviceNameEdit.Value := settings.Has("deviceName")
            ? settings["deviceName"] : SubStr(A_ComputerName " Launcher", 1, 80)
        for key, control in this.ToggleControls {
            this.ToggleValues[key] := settings[key]
            SettingsRenderer.SetState(control, settings[key])
        }
        this.RefreshSensitiveList()
        this.Status.Text := ""
        this.InlineStatus.Visible := false
        this.FocusKeyError.Text := ""
        this.PendingSave := false
        this.RefreshConnectionControls()
        this.RefreshCalendarControls()
        this.Loading := false
    }

    Candidate() {
        scaleValues := ["compact", "standard", "large"]
        scale := scaleValues[this.ScaleList.Value]
        exclusions := SettingsManager.NormalizeSensitiveApplications(
            this.SensitiveEdit.Value)
        if !exclusions.Ok
            return {Ok: false,
                Message: "Ignored apps must be executable names ending in .exe."}
        deviceName := RegExReplace(Trim(this.DeviceNameEdit.Value), "\s+", " ")
        if StrLen(deviceName) < 1 || StrLen(deviceName) > 80
            || RegExMatch(deviceName, "[\x00-\x1F\x7F]")
            return {Ok: false, Message: "Enter a device name from 1 to 80 characters."}
        monitorValues := ["active", "primary", "remembered"]
        themeValues := ["system", "dark", "light"]
        return {Ok: true, Values: Map(
            "focusKey", Trim(this.FocusKeyEdit.Value, " `t"),
            "startWithWindows", this.ToggleValues["startWithWindows"],
            "openingMonitor", monitorValues[this.MonitorList.Value],
            "openingPosition", this.OpeningPositionValue,
            "launcherScale", scale,
            "panelWidth", SettingsManager.PanelWidthForScale(scale),
            "alwaysOnTop", this.ToggleValues["alwaysOnTop"],
            "closeOnFocusLost", this.ToggleValues["closeOnFocusLost"],
            "closeAfterSelection", this.ToggleValues["closeAfterSelection"],
            "autoPasteAfterSelection", this.ToggleValues["autoPasteAfterSelection"],
            "clipboardPaused", this.ToggleValues["clipboardPaused"],
            "sensitiveApplications", exclusions.Value,
            "theme", themeValues[this.ThemeList.Value],
            "reducedMotion", true,
            "loggingEnabled", this.ToggleValues["loggingEnabled"],
            "deviceName", deviceName
        )}
    }

    QueueAutoSave(immediate := false) {
        if this.Loading || this.Closed
            return false
        this.PendingSave := true
        this.RevertFailedSave := immediate
        this.SetSavingStatus()
        try SetTimer(this.AutoSaveTimer, 0)
        if immediate
            return this.AutoSave()
        SetTimer(this.AutoSaveTimer, -350)
        return true
    }

    SetSavingStatus() {
        SetTimer(this.StatusHideTimer, 0)
        this.Status.SetFont("s9 c" ThemeManager.Hex("MutedText"),
            "Segoe UI Variable Text")
        this.Status.Text := "Saving..."
    }

    AutoSave(*) {
        if this.Loading || this.Closed || !this.PendingSave
            return true
        try SetTimer(this.AutoSaveTimer, 0)
        this.PendingSave := false
        revertFailedSave := this.RevertFailedSave
        this.RevertFailedSave := false
        candidate := this.Candidate()
        if !candidate.Ok {
            if revertFailedSave
                this.LoadValues(this.Settings)
            this.SetStatus(candidate.Message, true)
            return false
        }
        oldTheme := this.Settings["theme"]
        result := this.ApplyCallback.Call("save", candidate.Values)
        if !IsObject(result) || !result.Ok {
            if revertFailedSave
                this.LoadValues(this.Settings)
            this.SetStatus(IsObject(result) && result.HasOwnProp("Message")
                ? result.Message : "This change could not be saved.", true)
            return false
        }
        if result.HasOwnProp("Values") {
            this.Settings := result.Values
            if IsObject(this.ConnectionManager)
                this.ConnectionManager.Settings := result.Values
            if result.Values["theme"] != oldTheme {
                ThemeManager.Configure(result.Values)
                this.ApplyTheme()
            }
        }
        this.SetStatus("Saved")
        return true
    }

    TestFocusKey() {
        result := HotkeyManager.Validate(Trim(this.FocusKeyEdit.Value, " `t"))
        this.SetStatus(result.Ok ? "Shortcut is available."
            : "This shortcut is invalid, reserved, or unavailable.", !result.Ok)
    }

    ConfirmReset() {
        this.Gui.Opt("+OwnDialogs")
        answer := MsgBox(
            "Reset launcher settings to safe defaults?`n`n"
            "Your Olio account connection and protected credential will be preserved.",
            "Reset Olio Launcher settings", "YesNo Icon! Default2")
        if answer != "Yes"
            return false
        result := this.ApplyCallback.Call("reset", Map())
        if !IsObject(result) || !result.Ok {
            this.SetStatus("Settings could not be reset. Nothing changed.", true)
            return false
        }
        ThemeManager.Configure(result.Values)
        this.LoadValues(result.Values)
        this.ApplyTheme()
        this.SetStatus("Reset complete. Your account connection was preserved.")
        return true
    }

    StartConnection() {
        if !IsObject(this.ConnectionManager)
            return false
        if this.PendingSave && !this.AutoSave()
            return false
        started := this.ConnectionManager.StartPairing(this.DeviceNameEdit.Value)
        this.RefreshConnectionControls()
        return started
    }

    ConfirmDisconnect() {
        if !IsObject(this.ConnectionManager) || !this.ConnectionManager.Credential
            return false
        this.Gui.Opt("+OwnDialogs")
        answer := MsgBox("Disconnect this Olio Launcher?`n`n"
            "Workstation access will be revoked and the protected local credential removed.",
            "Disconnect Olio account", "YesNo Icon! Default2")
        if answer = "Yes"
            return this.ConnectionManager.Disconnect()
        return false
    }

    OnConnectionChanged(*) {
        if !this.Closed
            this.RefreshConnectionControls()
    }

    OnCalendarChanged(*) {
        if !this.Closed
            this.RefreshCalendarControls()
    }

    RefreshCalendarNow() {
        if !IsObject(this.CalendarManager)
            return false
        return this.CalendarManager.Refresh()
    }

    RefreshCalendarControls() {
        if !IsObject(this.CalendarRefreshButton)
            return
        manager := this.CalendarManager
        this.CalendarStatus.Text := IsObject(manager) ? manager.Detail
            : "Calendar controls are unavailable in this isolated window."
        hasCredential := IsObject(this.ConnectionManager)
            && this.ConnectionManager.Credential
        busy := IsObject(manager) && manager.RequestBusy
        SettingsRenderer.SetEnabled(this.CalendarRefreshButton,
            IsObject(manager) && hasCredential && !busy)
    }

    RefreshConnectionControls() {
        manager := this.ConnectionManager
        state := IsObject(manager) ? manager.State : "unavailable"
        this.ConnectionStatus.Text := IsObject(manager) ? manager.Detail
            : "Account controls are unavailable in this isolated test window."
        waiting := state = "starting" || state = "waiting" || state = "exchanging"
        connected := state = "connected" || state = "checking"
            || state = "disconnecting"
        hasCredential := IsObject(manager) && manager.Credential
        hasPairing := IsObject(manager) && manager.RequestId && manager.PairingSecret
        recoveryPairing := hasPairing && !waiting
        recoveryCredential := hasCredential && !waiting && !connected
        accountVisible := this.CurrentSection = "account"
        this.ConnectButton.Visible := accountVisible && !waiting && !connected
            && !hasCredential && !hasPairing
        this.CancelConnectionButton.Visible := accountVisible
            && (waiting || recoveryPairing)
        this.RetryConnectionButton.Visible := accountVisible
            && (recoveryCredential || recoveryPairing)
        this.DisconnectButton.Visible := accountVisible
            && (connected || recoveryCredential)
        busy := IsObject(manager) && manager.RequestBusy
        for control in [this.ConnectButton, this.CancelConnectionButton,
            this.RetryConnectionButton, this.DisconnectButton]
            SettingsRenderer.SetEnabled(control, IsObject(manager) && !busy)
        this.DeviceNameEdit.Enabled := !waiting && !connected
        if recoveryPairing {
            this.RetryConnectionButton.Move(232, 334, 238, 40)
            this.CancelConnectionButton.Move(486, 334, 238, 40)
        } else if recoveryCredential {
            this.RetryConnectionButton.Move(232, 334, 238, 40)
            this.DisconnectButton.Move(486, 334, 238, 40)
        } else {
            this.ConnectButton.Move(232, 334, 492, 40)
            this.CancelConnectionButton.Move(232, 334, 492, 40)
            this.DisconnectButton.Move(232, 334, 492, 40)
        }
        if !this.Loading
            WindowsInterop.AnnounceStatus(this.ConnectionStatus)
    }

    InitialSection() {
        if !IsObject(this.ConnectionManager)
            return "general"
        state := this.ConnectionManager.State
        return state = "waiting" || state = "starting" || state = "exchanging"
            || (this.ConnectionManager.RequestId && this.ConnectionManager.PairingSecret)
            ? "account" : "general"
    }

    ShowSection(section, *) {
        if !this.Pages.Has(section)
            section := "general"
        this.StopPageAnimation()
        this.CurrentSection := section
        DllCall("SendMessageW", "ptr", this.Gui.Hwnd, "uint", 0x000B,
            "ptr", 0, "ptr", 0)
        for pageName, controls in this.Pages {
            visible := pageName = section
            for control in controls
                control.Visible := visible
        }
        for key, tab in this.Tabs
            SettingsRenderer.SetSelected(tab, key = section)
        this.InlineStatus.Visible := false
        this.RefreshConnectionControls()
        this.RefreshCalendarControls()
        DllCall("SendMessageW", "ptr", this.Gui.Hwnd, "uint", 0x000B,
            "ptr", 1, "ptr", 0)
        DllCall("RedrawWindow", "ptr", this.Gui.Hwnd, "ptr", 0, "ptr", 0,
            "uint", 0x0001 | 0x0004 | 0x0080 | 0x0100)
        this.RaiseSidebarLabels()
        if this.IsVisible() {
            this.AnimatePage(section)
            firstControl := section = "general" ? this.FocusKeyRecorder
                : section = "behavior" ? this.SegmentControls["openingMonitor"][1].Control
                : section = "clipboard" ? this.ClipboardPausedCheck
                : section = "appearance" ? this.SegmentControls["theme"][1].Control
                : section = "account" ? this.DeviceNameEdit : this.DiagnosticsCheck
            firstControl.Focus()
        }
    }

    AnimatePage(section) {
        if ThemeManager.ReducedMotion || this.TestMode
            return
        this.PageAnimationControls := this.Pages[section]
        this.PageAnimationStart := A_TickCount
        for control in this.PageAnimationControls {
            if this.PageLayouts.Has(control.Hwnd) {
                layout := this.PageLayouts[control.Hwnd]
                try control.Move(layout.X + 12, layout.Y, layout.Width, layout.Height)
            }
        }
        SetTimer(this.PageAnimationTimer, 16)
    }

    AnimatePageFrame(*) {
        if this.Closed {
            SetTimer(this.PageAnimationTimer, 0)
            return
        }
        progress := Min((A_TickCount - this.PageAnimationStart) / 140, 1)
        eased := 1 - (1 - progress) ** 3
        offset := Round(12 * (1 - eased))
        for control in this.PageAnimationControls {
            if this.PageLayouts.Has(control.Hwnd) {
                layout := this.PageLayouts[control.Hwnd]
                try control.Move(layout.X + offset, layout.Y, layout.Width, layout.Height)
            }
        }
        DllCall("RedrawWindow", "ptr", this.Gui.Hwnd, "ptr", 0, "ptr", 0,
            "uint", 0x0001 | 0x0004 | 0x0080 | 0x0100)
        if progress >= 1 {
            SetTimer(this.PageAnimationTimer, 0)
            this.RaiseSidebarLabels()
        }
    }

    RaiseSidebarLabels() {
        for control in [this.Brand, this.SidebarHint]
            try DllCall("InvalidateRect", "ptr", control.Hwnd,
                "ptr", 0, "int", true)
    }

    StopPageAnimation() {
        try SetTimer(this.PageAnimationTimer, 0)
        if this.HasOwnProp("PageAnimationControls") {
            for control in this.PageAnimationControls {
                if this.PageLayouts.Has(control.Hwnd) {
                    layout := this.PageLayouts[control.Hwnd]
                    try control.Move(layout.X, layout.Y, layout.Width, layout.Height)
                }
            }
        }
    }

    SetStatus(text, isError := false) {
        SetTimer(this.StatusHideTimer, 0)
        this.Status.SetFont("s9 c" ThemeManager.Hex(
            isError ? "ErrorText" : "SuccessText"), "Segoe UI Variable Text")
        this.Status.Text := isError ? "Needs attention" : text
        this.InlineStatus.SetFont("s9 c" ThemeManager.Hex("ErrorText"),
            "Segoe UI Variable Text")
        this.InlineStatus.Text := isError ? text : ""
        this.InlineStatus.Visible := isError
        WindowsInterop.AnnounceStatus(isError ? this.InlineStatus : this.Status)
        if !isError
            SetTimer(this.StatusHideTimer, -1600)
    }

    HideSavedStatus(*) {
        if !this.Closed && this.Status.Text = "Saved"
            this.Status.Text := ""
    }

    ApplyTheme() {
        this.Gui.BackColor := ThemeManager.Hex("Window")
        for surface in this.SurfaceControls
            try surface.Control.Opt("Background" ThemeManager.Hex(surface.Color))
        for control in this.TextControls
            control.SetFont("c" ThemeManager.Hex("Text"), "Segoe UI Variable Text")
        for control in this.MutedTextControls
            control.SetFont("c" ThemeManager.Hex("MutedText"),
                "Segoe UI Variable Text")
        for control in this.InputControls
            try control.Opt("Background" ThemeManager.Hex("Input")
                " c" ThemeManager.Hex("Text"))
        dark := ThemeManager.Mode = "dark"
        darkValue := dark ? 1 : 0
        cornerPreference := 2 ; DWMWCP_ROUND
        backdropType := 2 ; DWMSBT_MAINWINDOW
        try DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd,
            "uint", 20, "int*", &darkValue, "uint", 4)
        try DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd,
            "uint", 33, "int*", &cornerPreference, "uint", 4)
        try DllCall("dwmapi\DwmSetWindowAttribute", "ptr", this.Gui.Hwnd,
            "uint", 38, "int*", &backdropType, "uint", 4)
        themeName := dark ? "DarkMode_Explorer" : "Explorer"
        for control in this.InputControls
            try DllCall("uxtheme\SetWindowTheme", "ptr", control.Hwnd,
                "str", themeName, "ptr", 0)
        ; Combo boxes use the common-file-dialog theme class on modern Windows;
        ; Explorer's dark class leaves the closed field stark white.
        try DllCall("uxtheme\SetWindowTheme", "ptr", this.ScaleList.Hwnd,
            "str", dark ? "DarkMode_CFD" : "CFD", "ptr", 0)
        for control in this.DrawnControls
            DllCall("InvalidateRect", "ptr", control.Hwnd, "ptr", 0, "int", true)
    }

    Show() {
        area := WindowsInterop.ForegroundWorkArea()
        showWidth := this.TestMode
            ? Round(SettingsDialog.LogicalWidth * A_ScreenDPI / 96)
            : SettingsDialog.LogicalWidth
        showHeight := this.TestMode
            ? Round(SettingsDialog.LogicalHeight * A_ScreenDPI / 96)
            : SettingsDialog.LogicalHeight
        this.Gui.Show("Hide x" area.Left " y" area.Top
            " w" showWidth " h" showHeight)
        windowRect := Buffer(16, 0)
        if DllCall("GetWindowRect", "ptr", this.Gui.Hwnd, "ptr", windowRect) {
            width := NumGet(windowRect, 8, "int") - NumGet(windowRect, 0, "int")
            height := NumGet(windowRect, 12, "int") - NumGet(windowRect, 4, "int")
        } else
            this.Gui.GetPos(,, &width, &height)
        geometry := WindowsInterop.ClampWindowPosition(area,
            area.Left + Floor(((area.Right - area.Left) - width) / 2),
            area.Top + Floor(((area.Bottom - area.Top) - height) / 2),
            width, height)
        if this.TestMode {
            DllCall("SetWindowPos", "ptr", this.Gui.Hwnd, "ptr", 0,
                "int", -10000, "int", -10000, "int", 0, "int", 0,
                "uint", 0x0001 | 0x0040 | 0x0010)
        } else {
            DllCall("SetWindowPos", "ptr", this.Gui.Hwnd, "ptr", 0,
                "int", geometry.X, "int", geometry.Y, "int", 0, "int", 0,
                "uint", 0x0001 | 0x0010)
            if ThemeManager.ReducedMotion
                this.Gui.Show("NoActivate")
            else
                DllCall("AnimateWindow", "ptr", this.Gui.Hwnd, "uint", 140,
                    "uint", 0x00080000 | 0x00020000)
        }
        firstControl := this.CurrentSection = "account"
            ? this.DeviceNameEdit : this.FocusKeyRecorder
        firstControl.Focus()
    }

    IsVisible() {
        return !this.Closed && DllCall("IsWindowVisible", "ptr", this.Gui.Hwnd)
    }

    Focus() {
        if this.IsVisible()
            DllCall("SetForegroundWindow", "ptr", this.Gui.Hwnd)
    }

    Close(*) {
        if this.Closed
            return
        try SetTimer(this.AutoSaveTimer, 0)
        try SetTimer(this.StatusHideTimer, 0)
        this.StopPageAnimation()
        if this.PendingSave
            this.AutoSave()
        if !this.TestMode && !ThemeManager.ReducedMotion && this.IsVisible()
            try DllCall("AnimateWindow", "ptr", this.Gui.Hwnd, "uint", 90,
                "uint", 0x00090000)
        this.Closed := true
        this.Tooltips.Destroy()
        try OnMessage(0x0111, this.CommandHandler, 0)
        for control in this.DrawnControls
            SettingsRenderer.Unregister(control)
        try this.Gui.Destroy()
        if IsObject(this.ClosedCallback)
            this.ClosedCallback.Call()
    }
}
