#Requires AutoHotkey v2.0.26
#Warn All, StdOut

DllCall("SetProcessDpiAwarenessContext", "ptr", -4, "ptr")

#Include ..\src\FlatJson.ahk
#Include ..\src\SettingsManager.ahk
#Include ..\src\ThemeManager.ahk
#Include ..\src\HotkeyManager.ahk
#Include ..\src\WindowsInterop.ahk
#Include ..\src\ClipboardManager.ahk
#Include ..\src\Navigation.ahk
#Include ..\src\TileRenderer.ahk
#Include ..\src\ClipboardRenderer.ahk
#Include ..\src\QuickPastesRenderer.ahk
#Include ..\src\CalendarRenderer.ahk
#Include ..\src\ClipboardPreviewWindow.ahk
#Include ..\src\SettingsDialog.ahk
#Include ..\src\LauncherWindow.ahk

class ClipboardPreviewTests {
    static Passed := 0

    static Assert(condition, message) {
        if !condition
            throw Error(message)
        this.Passed += 1
    }

    static MakeDib(width := 3, height := 2, color := 0x004080FF) {
        bitsSize := width * height * 4
        dib := Buffer(40 + bitsSize, 0)
        NumPut("uint", 40, dib, 0)
        NumPut("int", width, dib, 4)
        NumPut("int", height, dib, 8)
        NumPut("ushort", 1, dib, 12)
        NumPut("ushort", 32, dib, 14)
        NumPut("uint", bitsSize, dib, 20)
        loop width * height
            NumPut("uint", color, dib, 40 + (A_Index - 1) * 4)
        return dib
    }

    static Resources() {
        process := DllCall("GetCurrentProcess", "ptr")
        return {
            Gdi: DllCall("GetGuiResources", "ptr", process, "uint", 0, "uint"),
            User: DllCall("GetGuiResources", "ptr", process, "uint", 1, "uint")
        }
    }

    static Run() {
        settings := SettingsManager.Defaults()
        settings["sensitiveApplications"] := ""
        manager := ClipboardManager(settings)
        manager.CaptureText("harmless preview text")
        window := LauncherWindow(settings, (*) => 0, true, manager)
        window.Gui.Show("NA x-10000 y-10000 w360 h500")
        window.ShowPage("clipboard")
        try {
            this.Assert(!window.ClipboardOpenButton.Enabled,
                "Open was enabled for a selected text entry.")
            this.Assert(!window.OpenClipboardPreview(),
                "A text entry opened an image preview.")

            manager.CaptureDib(this.MakeDib())
            window.RefreshClipboardHistory()
            this.Assert(window.ClipboardOpenButton.Enabled,
                "Open was disabled for a selected image entry.")
            window.ClipboardOpenButton.GetPos(&openX, &openY, &openWidth, &openHeight)
            window.ClipboardDeleteButton.GetPos(&deleteX, &deleteY)
            this.Assert(openX + openWidth < deleteX && openY = deleteY,
                "Open is not immediately left of Delete.")

            window.OnCommand(0, window.ClipboardOpenButton.Hwnd, 0, window.Gui.Hwnd)
            this.Assert(IsObject(window.PreviewWindow),
                "The image preview button did not open: " window.LastPreviewError)
            preview := window.PreviewWindow
            canvasHwnd := preview.Canvas.Hwnd
            closeHwnd := preview.CloseButton.Hwnd
            DllCall("RedrawWindow", "ptr", canvasHwnd, "ptr", 0, "ptr", 0,
                "uint", 0x0001 | 0x0004 | 0x0100)
            Sleep(25)
            sourcePointer := manager.Entries[1].Dib.Ptr
            this.Assert(preview.IsVisible() && preview.Dib.Ptr != sourcePointer,
                "Preview did not own an independent in-memory image buffer.")
            this.Assert(preview.PaintCount > 0 && preview.LastPaintResult = preview.Height,
                "The native image preview paint result is count=" preview.PaintCount
                    ", rows=" preview.LastPaintResult ", expected=" preview.Height ".")
            this.Assert(ClipboardPreviewWindow.Canvases.Has(canvasHwnd),
                "Preview canvas was not registered for native painting.")
            previewStyle := DllCall("GetWindowLongW", "ptr", preview.Gui.Hwnd,
                "int", -16, "uint")
            closeStyle := DllCall("GetWindowLongW", "ptr", closeHwnd,
                "int", -16, "uint")
            preview.CloseButton.GetPos(&closeX, &closeY, &closeWidth, &closeHeight)
            preview.Canvas.GetPos(&canvasX, &canvasY)
            this.Assert((previewStyle & 0x00C00000) != 0x00C00000,
                "Preview retained the standard Windows caption chrome.")
            this.Assert((closeStyle & 0xF) = 0xB
                && TileRenderer.Tiles[closeHwnd].IconKind = "x",
                "Preview close control is not an owner-drawn Olio utility button.")
            this.Assert(closeY < canvasY && closeWidth <= 48 && closeHeight <= 40,
                "Preview retained the large bottom-right Close button.")
            this.Assert(!preview.HasOwnProp("Metadata")
                && preview.HeaderTitle.Text = "Image Preview",
                "Preview retained dimensions, memory text, or redundant chrome.")
            previousForeground := window.PrepareScreenshotCapture(false)
            this.Assert(window.IsVisible() && preview.IsVisible()
                && window.DirectScreenshotActive,
                "Direct screenshot preparation hid the launcher or image preview.")
            window.RestoreAfterScreenshot(previousForeground)
            this.Assert(window.IsVisible() && preview.IsVisible()
                && !window.DirectScreenshotActive,
                "Direct screenshot completion did not preserve launcher-owned windows.")
            manager.Clear()
            this.Assert(IsObject(preview.Dib) && preview.Dib.Size = 64,
                "Clearing history invalidated the open preview buffer.")
            window.CloseClipboardPreview(false)
            this.Assert(!IsObject(window.PreviewWindow)
                && !ClipboardPreviewWindow.Canvases.Has(canvasHwnd)
                && !ClipboardPreviewWindow.CloseButtons.Has(closeHwnd),
                "Preview close retained its window or paint registration.")

            manager.CaptureDib(this.MakeDib())
            window.RefreshClipboardHistory()
            loop 3 {
                this.Assert(window.OpenClipboardPreview(),
                    "Preview cleanup warmup failed.")
                window.CloseClipboardPreview(false)
            }
            before := this.Resources()
            loop 20 {
                this.Assert(window.OpenClipboardPreview(),
                    "Repeated preview open failed.")
                window.CloseClipboardPreview(false)
            }
            Sleep(50)
            after := this.Resources()
            this.Assert(after.Gdi <= before.Gdi,
                "Repeated preview open/close leaked GDI objects.")
            this.Assert(after.User <= before.User,
                "Repeated preview open/close leaked USER objects.")
            this.Assert(ClipboardPreviewWindow.Canvases.Count = 0,
                "Repeated preview cleanup retained canvas registrations.")
            this.Assert(ClipboardPreviewWindow.CloseButtons.Count = 0
                && ClipboardPreviewWindow.DragTargets.Count = 0,
                "Repeated preview cleanup retained close or drag registrations.")

            manager.CaptureText("text selected again")
            window.RefreshClipboardHistory()
            this.Assert(!window.ClipboardOpenButton.Enabled,
                "Open did not grey out after text became selected.")
        } finally {
            window.CloseClipboardPreview(false)
            try window.Gui.Destroy()
            manager.Shutdown()
        }
        FileAppend("CLIPBOARD_PREVIEW_TEST`tPASS`t" this.Passed
            " assertions`n", "*", "UTF-8")
        ExitApp(0)
    }
}

try ClipboardPreviewTests.Run()
catch as testError {
    FileAppend("CLIPBOARD_PREVIEW_TEST`tFAIL`t"
        SubStr(RegExReplace(testError.Message, "[\r\n\t]", " "), 1, 220)
        "`n", "*", "UTF-8")
    ExitApp(1)
}
