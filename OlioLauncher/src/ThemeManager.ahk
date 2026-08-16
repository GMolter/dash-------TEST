class ThemeManager {
    static Mode := "dark"
    static HighContrast := false
    static ReducedMotion := false
    static Colors := ThemeManager.DarkPalette()

    static Configure(settings) {
        preference := IsObject(settings) && settings.Has("theme")
            ? settings["theme"] : "system"
        ; Settings motion is intentionally disabled until the native renderer can
        ; guarantee artifact-free transitions on every Windows/DPI combination.
        this.ReducedMotion := true
        this.HighContrast := this.IsHighContrastEnabled()
        if this.HighContrast {
            this.Mode := "high-contrast"
            this.Colors := this.HighContrastPalette()
        } else {
            if preference = "system"
                preference := this.SystemUsesLightTheme() ? "light" : "dark"
            this.Mode := preference = "light" ? "light" : "dark"
            this.Colors := this.Mode = "light" ? this.LightPalette() : this.DarkPalette()
        }
        return this.Mode
    }

    static DarkPalette() {
        return Map(
            "Window", 0x020617, "Surface", 0x0B1220,
            "Sidebar", 0x020617, "SurfaceElevated", 0x111827,
            "SurfaceHover", 0x0F172A, "SurfacePressed", 0x1E1B4B,
            "SurfaceSelected", 0x101B33, "DisabledSurface", 0x070D1A,
            "Border", 0x293548, "MutedBorder", 0x1E293B,
            "Text", 0xF8FAFC, "MutedText", 0x94A3B8,
            "DisabledText", 0x64748B, "ErrorText", 0xFCA5A5,
            "SuccessText", 0xA7F3D0, "Input", 0x0F172A,
            "Accent", 0x38BDF8, "AccentSecondary", 0x8B5CF6,
            "LauncherWindow", 0x070B18, "LauncherSurface", 0x101827,
            "LauncherSurfaceHover", 0x152137, "LauncherSurfacePressed", 0x182641,
            "LauncherSurfaceSelected", 0x102641, "LauncherBorder", 0x263750,
            "LauncherHighlight", 0x34445D, "LauncherShadow", 0x030611,
            "LauncherInput", 0x0B1322
        )
    }

    static LightPalette() {
        return Map(
            "Window", 0xF8FAFC, "Surface", 0xFFFFFF,
            "Sidebar", 0xF8FAFC, "SurfaceElevated", 0xFFFFFF,
            "SurfaceHover", 0xF1F5F9, "SurfacePressed", 0xE2E8F0,
            "SurfaceSelected", 0xE0F2FE, "DisabledSurface", 0xE2E8F0,
            "Border", 0x64748B, "MutedBorder", 0x94A3B8,
            "Text", 0x0F172A, "MutedText", 0x475569,
            "DisabledText", 0x64748B, "ErrorText", 0x991B1B,
            "SuccessText", 0x166534, "Input", 0xFFFFFF,
            "Accent", 0x0284C7, "AccentSecondary", 0x7C3AED,
            "LauncherWindow", 0xEFF3F9, "LauncherSurface", 0xFAFCFF,
            "LauncherSurfaceHover", 0xFFFFFF, "LauncherSurfacePressed", 0xE7EEF7,
            "LauncherSurfaceSelected", 0xE1F2FC, "LauncherBorder", 0xB7C3D2,
            "LauncherHighlight", 0xFFFFFF, "LauncherShadow", 0xD6DEE9,
            "LauncherInput", 0xFFFFFF
        )
    }

    static HighContrastPalette() {
        return Map(
            "Window", this.SystemColor(5), "Surface", this.SystemColor(15),
            "Sidebar", this.SystemColor(5), "SurfaceElevated", this.SystemColor(15),
            "SurfaceHover", this.SystemColor(13), "SurfacePressed", this.SystemColor(13),
            "SurfaceSelected", this.SystemColor(13), "DisabledSurface", this.SystemColor(15),
            "Border", this.SystemColor(8), "MutedBorder", this.SystemColor(8),
            "Text", this.SystemColor(8), "MutedText", this.SystemColor(8),
            "DisabledText", this.SystemColor(17), "ErrorText", this.SystemColor(8),
            "SuccessText", this.SystemColor(8), "Input", this.SystemColor(5),
            "Accent", this.SystemColor(13), "AccentSecondary", this.SystemColor(13),
            "LauncherWindow", this.SystemColor(5),
            "LauncherSurface", this.SystemColor(15),
            "LauncherSurfaceHover", this.SystemColor(13),
            "LauncherSurfacePressed", this.SystemColor(13),
            "LauncherSurfaceSelected", this.SystemColor(13),
            "LauncherBorder", this.SystemColor(8),
            "LauncherHighlight", this.SystemColor(8),
            "LauncherShadow", this.SystemColor(5),
            "LauncherInput", this.SystemColor(5)
        )
    }

    static Color(name, fallback := 0) {
        return this.Colors.Has(name) ? this.Colors[name] : fallback
    }

    static Hex(name, fallback := 0) => Format("{:06X}", this.Color(name, fallback))

    static IsHighContrastEnabled() {
        size := A_PtrSize = 8 ? 16 : 12
        highContrast := Buffer(size, 0)
        NumPut("uint", size, highContrast, 0)
        if !DllCall("SystemParametersInfoW", "uint", 0x0042, "uint", size,
            "ptr", highContrast, "uint", 0)
            return false
        return (NumGet(highContrast, 4, "uint") & 0x1) != 0
    }

    static SystemUsesLightTheme() {
        try return RegRead(
            "HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
            "AppsUseLightTheme") != 0
        catch
            return false
    }

    static SystemColor(index) {
        colorRef := DllCall("GetSysColor", "int", index, "uint")
        return ((colorRef & 0xFF) << 16) | (colorRef & 0xFF00)
            | ((colorRef >> 16) & 0xFF)
    }

    static ContrastRatio(first, second) {
        luminance(rgb) {
            channel(value) {
                value /= 255
                return value <= 0.04045 ? value / 12.92
                    : ((value + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * channel((rgb >> 16) & 0xFF)
                + 0.7152 * channel((rgb >> 8) & 0xFF)
                + 0.0722 * channel(rgb & 0xFF)
        }
        lighter := luminance(first), darker := luminance(second)
        if lighter < darker
            temporary := lighter, lighter := darker, darker := temporary
        return (lighter + 0.05) / (darker + 0.05)
    }
}
