class ScreenshotManager {
    static CF_BITMAP := 2
    static SRCCOPY := 0x00CC0020
    static CAPTUREBLT := 0x40000000
    static IDC_ARROW := 32512
    static IDC_CROSS := 32515
    static BORDER_WIDTH := 2
    static DIM_ALPHA := 108
    static ACCENT := 0x8B5CF6
    static OVERLAY := 0x020617
    static SURFACE := 0x0B1220
    static TEXT := 0xF8FAFC

    __New(clipboardManager := 0, finishedCallback := 0) {
        this.ClipboardManager := clipboardManager
        this.FinishedCallback := finishedCallback
        this.Active := false
        this.Dragging := false
        this.HasSelection := false
        this.Overlay := 0
        this.SelectionHwnd := 0
        this.Bounds := 0
        this.FrozenBitmap := 0
        this.FrozenDc := 0
        this.FrozenOriginal := 0
        this.DimBitmap := 0
        this.DimDc := 0
        this.DimOriginal := 0
        this.SelectionBitmap := 0
        this.SelectionDc := 0
        this.SelectionOriginal := 0
        this.PreviousForeground := 0
        this.StartX := 0
        this.StartY := 0
        this.CurrentX := 0
        this.CurrentY := 0
        this.LastSelectionRect := 0
        this.InstructionDpi := 96
        this.OverlayLatencyMs := 0.0
        this.LastResult := {Status: "ready", OverlayLatencyMs: 0.0,
            CompletionLatencyMs: 0.0}
        this.MessagesRegistered := false
        this.Stopped := false

        this.MouseDownHandler := ObjBindMethod(this, "OnMouseDown")
        this.MouseMoveHandler := ObjBindMethod(this, "OnMouseMove")
        this.MouseUpHandler := ObjBindMethod(this, "OnMouseUp")
        this.PaintHandler := ObjBindMethod(this, "OnPaint")
        this.EraseHandler := ObjBindMethod(this, "OnEraseBackground")
        this.CursorHandler := ObjBindMethod(this, "OnSetCursor")
        this.KeyHandler := ObjBindMethod(this, "OnKeyDown")
        this.EscapeHandler := ObjBindMethod(this, "CancelFromEscape")
        this.ExitHandler := ObjBindMethod(this, "OnProcessExit")
        this.RegisterMessages()
        OnExit(this.ExitHandler)
    }

    RegisterMessages() {
        if this.MessagesRegistered
            return
        OnMessage(0x0201, this.MouseDownHandler) ; WM_LBUTTONDOWN
        OnMessage(0x0200, this.MouseMoveHandler) ; WM_MOUSEMOVE
        OnMessage(0x0202, this.MouseUpHandler) ; WM_LBUTTONUP
        OnMessage(0x000F, this.PaintHandler) ; WM_PAINT
        OnMessage(0x0014, this.EraseHandler) ; WM_ERASEBKGND
        OnMessage(0x0020, this.CursorHandler) ; WM_SETCURSOR
        OnMessage(0x0100, this.KeyHandler) ; WM_KEYDOWN
        this.MessagesRegistered := true
    }

    Begin(previousForeground := 0, boundsOverride := 0) {
        if this.Active || this.Stopped
            return false
        this.Active := true
        this.PreviousForeground := previousForeground
        this.Bounds := IsObject(boundsOverride)
            ? ScreenshotManager.NormalizeBounds(boundsOverride)
            : ScreenshotManager.VirtualDesktopBounds()
        started := ScreenshotManager.Qpc()
        try {
            if !ScreenshotManager.ValidBounds(this.Bounds)
                throw ValueError("The virtual desktop has no capturable area.")
            this.InstructionDpi := ScreenshotManager.DpiAtPoint(
                this.Bounds.Left + Floor(this.Bounds.Width / 2),
                this.Bounds.Top + 1)
            ; Freeze one compositor-complete frame before any capture UI is visible.
            ScreenshotManager.FlushDesktopComposition()
            if !this.CaptureFrozenDesktop()
                throw OSError()
            this.CreateOverlay()
            this.OverlayLatencyMs := ScreenshotManager.QpcMs(started)
            this.LastResult := {Status: "selecting",
                OverlayLatencyMs: this.OverlayLatencyMs, CompletionLatencyMs: 0.0}
            return true
        } catch {
            this.CleanupOverlay()
            this.Finish("overlay-failed", 0.0)
            return false
        }
    }

    CreateOverlay() {
        bounds := this.Bounds
        overlay := Gui("+AlwaysOnTop -Caption +ToolWindow -DPIScale",
            "Olio Screenshot — select an area; Escape cancels")
        overlay.BackColor := Format("{:06X}", ScreenshotManager.OVERLAY)
        this.Overlay := overlay
        ; Size the opaque frozen-frame surface while hidden so activation never flashes
        ; an unpainted window over the desktop.
        overlay.Show("Hide x" bounds.Left " y" bounds.Top " w" bounds.Width
            " h" bounds.Height)
        if !this.CreateSelectionSurface()
            throw OSError()
        ; SetWindowPos uses the physical virtual-desktop rectangle directly. This keeps
        ; negative coordinates and mixed-DPI monitor spans out of AHK's GUI scaling.
        if !DllCall("SetWindowPos", "ptr", overlay.Hwnd, "ptr", -1,
            "int", bounds.Left, "int", bounds.Top, "int", bounds.Width,
            "int", bounds.Height, "uint", 0x0040)
            throw OSError()
        DllCall("SetForegroundWindow", "ptr", overlay.Hwnd)
        DllCall("SetFocus", "ptr", overlay.Hwnd, "ptr")
        DllCall("UpdateWindow", "ptr", overlay.Hwnd)
        cursor := DllCall("LoadCursorW", "ptr", 0, "ptr",
            ScreenshotManager.IDC_CROSS, "ptr")
        if cursor
            DllCall("SetCursor", "ptr", cursor)
    }

    CreateSelectionSurface() {
        if !IsObject(this.Overlay)
            return false
        ; This top-level owned surface is never conventionally painted. UpdateLayeredWindow
        ; presents its pixels, size, and position to DWM in one atomic operation.
        this.SelectionHwnd := DllCall("CreateWindowExW",
            "uint", 0x00080000 | 0x00000020 | 0x08000000 | 0x00000080
                | 0x00000008,
            "str", "Static", "str", "", "uint", 0x80000000,
            "int", 0, "int", 0,
            "int", 1, "int", 1, "ptr", this.Overlay.Hwnd,
            "ptr", 0, "ptr", 0, "ptr", 0, "ptr")
        return this.SelectionHwnd != 0
    }

    UpdateSelectionSurface(rect) {
        this.LastSelectionRect := rect
        if !this.SelectionHwnd
            return
        if !IsObject(rect) || rect.Width <= 0 || rect.Height <= 0 {
            DllCall("ShowWindow", "ptr", this.SelectionHwnd, "int", 0)
            return
        }
        if !this.SelectionDc || !this.FrozenDc
            throw OSError()
        sourceX := rect.Left - this.Bounds.Left
        sourceY := rect.Top - this.Bounds.Top
        if !DllCall("BitBlt", "ptr", this.SelectionDc, "int", 0, "int", 0,
            "int", rect.Width, "int", rect.Height, "ptr", this.FrozenDc,
            "int", sourceX, "int", sourceY, "uint", ScreenshotManager.SRCCOPY)
            throw OSError()
        this.PaintSelectionBorder(this.SelectionDc, 0, 0, rect.Width, rect.Height)

        destination := Buffer(8, 0)
        NumPut("int", rect.Left, destination, 0)
        NumPut("int", rect.Top, destination, 4)
        size := Buffer(8, 0)
        NumPut("int", rect.Width, size, 0)
        NumPut("int", rect.Height, size, 4)
        source := Buffer(8, 0)
        if !DllCall("UpdateLayeredWindow", "ptr", this.SelectionHwnd,
            "ptr", 0, "ptr", destination, "ptr", size,
            "ptr", this.SelectionDc, "ptr", source, "uint", 0,
            "ptr", 0, "uint", 0x4)
            throw OSError()
        if !DllCall("IsWindowVisible", "ptr", this.SelectionHwnd)
            DllCall("ShowWindow", "ptr", this.SelectionHwnd, "int", 4)
    }

    static VirtualDesktopBounds() {
        left := SysGet(76), top := SysGet(77)
        width := SysGet(78), height := SysGet(79)
        return {Left: left, Top: top, Right: left + width,
            Bottom: top + height, Width: width, Height: height}
    }

    static NormalizeBounds(bounds) {
        left := bounds.HasOwnProp("Left") ? bounds.Left : 0
        top := bounds.HasOwnProp("Top") ? bounds.Top : 0
        if bounds.HasOwnProp("Right")
            right := bounds.Right
        else
            right := left + (bounds.HasOwnProp("Width") ? bounds.Width : 0)
        if bounds.HasOwnProp("Bottom")
            bottom := bounds.Bottom
        else
            bottom := top + (bounds.HasOwnProp("Height") ? bounds.Height : 0)
        return {Left: left, Top: top, Right: right, Bottom: bottom,
            Width: right - left, Height: bottom - top}
    }

    static ValidBounds(bounds) {
        return IsObject(bounds) && bounds.Width > 0 && bounds.Height > 0
            && bounds.Right > bounds.Left && bounds.Bottom > bounds.Top
    }

    static NormalizeSelection(startX, startY, endX, endY, bounds := 0) {
        if IsObject(bounds) {
            startX := ScreenshotManager.Clamp(startX, bounds.Left, bounds.Right)
            endX := ScreenshotManager.Clamp(endX, bounds.Left, bounds.Right)
            startY := ScreenshotManager.Clamp(startY, bounds.Top, bounds.Bottom)
            endY := ScreenshotManager.Clamp(endY, bounds.Top, bounds.Bottom)
        }
        left := Min(startX, endX), top := Min(startY, endY)
        right := Max(startX, endX), bottom := Max(startY, endY)
        return {Left: left, Top: top, Right: right, Bottom: bottom,
            Width: right - left, Height: bottom - top}
    }

    static Clamp(value, minimum, maximum) {
        return Min(Max(value, minimum), maximum)
    }

    static IsValidSelection(rect) {
        return ScreenshotManager.ValidBounds(rect)
    }

    static ScaleDip(value, dpi) {
        return Round(value * (dpi > 0 ? dpi : 96) / 96)
    }

    static DpiAtPoint(x, y) {
        packedPoint := (y & 0xFFFFFFFF) << 32 | (x & 0xFFFFFFFF)
        monitor := DllCall("MonitorFromPoint", "int64", packedPoint,
            "uint", 2, "ptr")
        dpiX := 96, dpiY := 96
        if monitor {
            try {
                if DllCall("Shcore\GetDpiForMonitor", "ptr", monitor, "uint", 0,
                    "uint*", &dpiX, "uint*", &dpiY, "uint") != 0
                    dpiX := 96
            }
        }
        return dpiX ? dpiX : 96
    }

    CursorPosition() {
        point := Buffer(8, 0)
        if !DllCall("GetCursorPos", "ptr", point)
            throw OSError()
        return {X: NumGet(point, 0, "int"), Y: NumGet(point, 4, "int")}
    }

    IsOverlayWindow(hwnd) {
        return this.Active && IsObject(this.Overlay) && hwnd
            && WindowsInterop.RootWindow(hwnd) = this.Overlay.Hwnd
    }

    OnMouseDown(wParam, lParam, msg, hwnd) {
        if !this.IsOverlayWindow(hwnd)
            return
        try {
            point := this.CursorPosition()
            point.X := ScreenshotManager.Clamp(point.X,
                this.Bounds.Left, this.Bounds.Right)
            point.Y := ScreenshotManager.Clamp(point.Y,
                this.Bounds.Top, this.Bounds.Bottom)
            this.StartX := point.X, this.StartY := point.Y
            this.CurrentX := point.X, this.CurrentY := point.Y
            this.Dragging := true
            this.HasSelection := true
            rect := ScreenshotManager.NormalizeSelection(
                this.StartX, this.StartY, this.CurrentX, this.CurrentY, this.Bounds)
            DllCall("SetCapture", "ptr", this.Overlay.Hwnd, "ptr")
            this.UpdateSelectionSurface(rect)
        } catch {
            this.Abort("selection-failed")
        }
        return 0
    }

    OnMouseMove(wParam, lParam, msg, hwnd) {
        if !this.Dragging || !this.Active
            return
        try {
            point := this.CursorPosition()
            nextX := ScreenshotManager.Clamp(point.X,
                this.Bounds.Left, this.Bounds.Right)
            nextY := ScreenshotManager.Clamp(point.Y,
                this.Bounds.Top, this.Bounds.Bottom)
            if nextX = this.CurrentX && nextY = this.CurrentY
                return 0
            this.CurrentX := nextX, this.CurrentY := nextY
            rect := ScreenshotManager.NormalizeSelection(
                this.StartX, this.StartY, this.CurrentX, this.CurrentY, this.Bounds)
            this.UpdateSelectionSurface(rect)
        } catch {
            this.Abort("selection-failed")
        }
        return 0
    }

    OnMouseUp(wParam, lParam, msg, hwnd) {
        if !this.Dragging || !this.Active
            return
        try {
            point := this.CursorPosition()
            this.CurrentX := ScreenshotManager.Clamp(point.X,
                this.Bounds.Left, this.Bounds.Right)
            this.CurrentY := ScreenshotManager.Clamp(point.Y,
                this.Bounds.Top, this.Bounds.Bottom)
            this.Dragging := false
            if DllCall("GetCapture", "ptr") = this.Overlay.Hwnd
                DllCall("ReleaseCapture")
            rect := ScreenshotManager.NormalizeSelection(this.StartX, this.StartY,
                this.CurrentX, this.CurrentY, this.Bounds)
            this.CompleteSelection(rect)
        } catch {
            this.Abort("capture-failed")
        }
        return 0
    }

    CompleteSelection(rect) {
        if !this.Active
            return false
        started := ScreenshotManager.Qpc()
        if !ScreenshotManager.IsValidSelection(rect) {
            this.CleanupOverlay()
            this.Finish("invalid-selection", ScreenshotManager.QpcMs(started))
            return false
        }

        bitmap := 0
        status := "capture-failed"
        usesFrozenFrame := this.SelectionUsesFrozenFrame(rect)
        if usesFrozenFrame
            bitmap := this.CopyFrozenSelection(rect)
        this.CleanupOverlay()
        try {
            ; Direct test callers can provide a rectangle outside the active overlay.
            ; Real pointer selections always use the frozen activation frame.
            if !usesFrozenFrame {
                ScreenshotManager.FlushDesktopComposition()
                bitmap := ScreenshotManager.CaptureScreenRect(rect)
            }
            if !bitmap
                throw OSError()
            if this.PublishBitmap(bitmap) {
                bitmap := 0 ; Windows owns the successfully transferred HBITMAP.
                status := "captured"
            } else
                status := "clipboard-busy"
        } catch {
            status := "capture-failed"
        } finally {
            if bitmap
                DllCall("DeleteObject", "ptr", bitmap)
        }
        this.Finish(status, ScreenshotManager.QpcMs(started))
        return status = "captured"
    }

    static CaptureScreenRect(rect) {
        if !ScreenshotManager.IsValidSelection(rect)
            return 0
        screenDc := DllCall("GetDC", "ptr", 0, "ptr")
        if !screenDc
            return 0
        try return ScreenshotManager.CopyPixelsToBitmap(screenDc, rect.Left,
            rect.Top, rect.Width, rect.Height)
        finally DllCall("ReleaseDC", "ptr", 0, "ptr", screenDc)
    }

    CaptureFrozenDesktop() {
        this.ReleaseFrozenDesktop()
        this.FrozenBitmap := ScreenshotManager.CaptureScreenRect(this.Bounds)
        if !this.FrozenBitmap
            return false
        screenDc := DllCall("GetDC", "ptr", 0, "ptr")
        if !screenDc {
            this.ReleaseFrozenDesktop()
            return false
        }
        try {
            this.FrozenDc := DllCall("CreateCompatibleDC", "ptr", screenDc, "ptr")
            this.DimDc := DllCall("CreateCompatibleDC", "ptr", screenDc, "ptr")
            this.SelectionDc := DllCall("CreateCompatibleDC", "ptr", screenDc, "ptr")
            this.DimBitmap := DllCall("CreateCompatibleBitmap", "ptr", screenDc,
                "int", 1, "int", 1, "ptr")
            this.SelectionBitmap := DllCall("CreateCompatibleBitmap", "ptr", screenDc,
                "int", this.Bounds.Width, "int", this.Bounds.Height, "ptr")
            if !this.FrozenDc || !this.DimDc || !this.SelectionDc
                || !this.DimBitmap || !this.SelectionBitmap {
                this.ReleaseFrozenDesktop()
                return false
            }
            this.FrozenOriginal := DllCall("SelectObject", "ptr", this.FrozenDc,
                "ptr", this.FrozenBitmap, "ptr")
            this.DimOriginal := DllCall("SelectObject", "ptr", this.DimDc,
                "ptr", this.DimBitmap, "ptr")
            this.SelectionOriginal := DllCall("SelectObject", "ptr", this.SelectionDc,
                "ptr", this.SelectionBitmap, "ptr")
            if !this.FrozenOriginal || this.FrozenOriginal = -1
                || !this.DimOriginal || this.DimOriginal = -1
                || !this.SelectionOriginal || this.SelectionOriginal = -1 {
                this.ReleaseFrozenDesktop()
                return false
            }
            pixel := Buffer(16, 0)
            NumPut("int", 1, pixel, 8), NumPut("int", 1, pixel, 12)
            brush := DllCall("CreateSolidBrush", "uint", 0, "ptr")
            try return brush && DllCall("FillRect", "ptr", this.DimDc,
                "ptr", pixel, "ptr", brush)
            finally {
                if brush
                    DllCall("DeleteObject", "ptr", brush)
            }
        } finally DllCall("ReleaseDC", "ptr", 0, "ptr", screenDc)
    }

    ReleaseFrozenDesktop() {
        if this.FrozenDc && this.FrozenOriginal && this.FrozenOriginal != -1
            DllCall("SelectObject", "ptr", this.FrozenDc,
                "ptr", this.FrozenOriginal, "ptr")
        if this.DimDc && this.DimOriginal && this.DimOriginal != -1
            DllCall("SelectObject", "ptr", this.DimDc,
                "ptr", this.DimOriginal, "ptr")
        if this.SelectionDc && this.SelectionOriginal && this.SelectionOriginal != -1
            DllCall("SelectObject", "ptr", this.SelectionDc,
                "ptr", this.SelectionOriginal, "ptr")
        if this.FrozenBitmap
            DllCall("DeleteObject", "ptr", this.FrozenBitmap)
        if this.DimBitmap
            DllCall("DeleteObject", "ptr", this.DimBitmap)
        if this.SelectionBitmap
            DllCall("DeleteObject", "ptr", this.SelectionBitmap)
        if this.FrozenDc
            DllCall("DeleteDC", "ptr", this.FrozenDc)
        if this.DimDc
            DllCall("DeleteDC", "ptr", this.DimDc)
        if this.SelectionDc
            DllCall("DeleteDC", "ptr", this.SelectionDc)
        this.FrozenBitmap := 0, this.FrozenDc := 0, this.FrozenOriginal := 0
        this.DimBitmap := 0, this.DimDc := 0, this.DimOriginal := 0
        this.SelectionBitmap := 0, this.SelectionDc := 0
        this.SelectionOriginal := 0
    }

    SelectionUsesFrozenFrame(rect) {
        return IsObject(this.Bounds) && this.FrozenDc
            && rect.Left >= this.Bounds.Left && rect.Top >= this.Bounds.Top
            && rect.Right <= this.Bounds.Right && rect.Bottom <= this.Bounds.Bottom
    }

    CopyFrozenSelection(rect) {
        if !this.SelectionUsesFrozenFrame(rect)
            return 0
        return ScreenshotManager.CopyPixelsToBitmap(this.FrozenDc,
            rect.Left - this.Bounds.Left, rect.Top - this.Bounds.Top,
            rect.Width, rect.Height)
    }

    static CopyPixelsToBitmap(sourceDc, sourceX, sourceY, width, height) {
        if !sourceDc || width <= 0 || height <= 0
            return 0
        memoryDc := DllCall("CreateCompatibleDC", "ptr", sourceDc, "ptr")
        if !memoryDc
            return 0
        bitmap := 0, original := 0, copied := false
        try {
            bitmap := DllCall("CreateCompatibleBitmap", "ptr", sourceDc,
                "int", width, "int", height, "ptr")
            if !bitmap
                return 0
            original := DllCall("SelectObject", "ptr", memoryDc, "ptr", bitmap, "ptr")
            if !original || original = -1
                return 0
            copied := DllCall("BitBlt", "ptr", memoryDc, "int", 0, "int", 0,
                "int", width, "int", height, "ptr", sourceDc, "int", sourceX,
                "int", sourceY, "uint", ScreenshotManager.SRCCOPY
                    | ScreenshotManager.CAPTUREBLT)
            return copied ? bitmap : 0
        } finally {
            if original && original != -1
                DllCall("SelectObject", "ptr", memoryDc, "ptr", original, "ptr")
            DllCall("DeleteDC", "ptr", memoryDc)
            if bitmap && !copied
                DllCall("DeleteObject", "ptr", bitmap)
        }
    }

    PublishBitmap(bitmap, attempts := 8, retryDelayMs := 15) {
        if !bitmap
            return false
        opened := false, transferred := false, mutationStarted := false
        historyEntry := 0
        try {
            if IsObject(this.ClipboardManager) {
                try {
                    historyEntry := this.ClipboardManager.PrepareBitmapEntry(bitmap)
                    this.ClipboardManager.BeginLauncherMutation()
                    mutationStarted := true
                }
            }
            opened := ScreenshotManager.OpenClipboardWithRetry(A_ScriptHwnd,
                attempts, retryDelayMs)
            if !opened
                return false
            if !DllCall("EmptyClipboard")
                return false
            if !DllCall("SetClipboardData", "uint", ScreenshotManager.CF_BITMAP,
                "ptr", bitmap, "ptr")
                return false
            transferred := true
            return true
        } finally {
            if opened
                DllCall("CloseClipboard")
            if mutationStarted
                try this.ClipboardManager.EndLauncherMutation()
            if IsObject(historyEntry) {
                if transferred {
                    try this.ClipboardManager.CommitPreparedEntry(historyEntry)
                    catch
                        historyEntry.Release()
                } else
                    historyEntry.Release()
            }
        }
    }

    static OpenClipboardWithRetry(ownerHwnd, attempts := 8, retryDelayMs := 15,
        attemptCallback := 0) {
        attempts := Max(1, attempts)
        loop attempts {
            opened := IsObject(attemptCallback)
                ? attemptCallback.Call(A_Index)
                : DllCall("OpenClipboard", "ptr", ownerHwnd)
            if opened
                return true
            if A_Index < attempts && retryDelayMs > 0
                Sleep(retryDelayMs)
        }
        return false
    }

    CancelFromEscape(*) {
        this.Cancel("cancelled")
    }

    Cancel(status := "cancelled") {
        if !this.Active
            return false
        this.CleanupOverlay()
        this.Finish(status, 0.0)
        return true
    }

    Abort(status) {
        if !this.Active
            return
        this.CleanupOverlay()
        this.Finish(status, 0.0)
    }

    Finish(status, completionLatencyMs) {
        previous := this.PreviousForeground
        this.PreviousForeground := 0
        this.Active := false
        this.LastResult := {Status: status, OverlayLatencyMs: this.OverlayLatencyMs,
            CompletionLatencyMs: completionLatencyMs}
        if IsObject(this.FinishedCallback)
            try this.FinishedCallback.Call(status, previous, this.LastResult)
    }

    CleanupOverlay() {
        overlay := this.Overlay
        this.Overlay := 0
        selectionHwnd := this.SelectionHwnd
        this.SelectionHwnd := 0
        if selectionHwnd
            try DllCall("DestroyWindow", "ptr", selectionHwnd)
        if IsObject(overlay) {
            try {
                if DllCall("GetCapture", "ptr") = overlay.Hwnd
                    DllCall("ReleaseCapture")
            }
            try overlay.Destroy()
        } else {
            try DllCall("ReleaseCapture")
        }
        this.ReleaseFrozenDesktop()
        this.Dragging := false
        this.HasSelection := false
        this.LastSelectionRect := 0
        arrow := DllCall("LoadCursorW", "ptr", 0, "ptr",
            ScreenshotManager.IDC_ARROW, "ptr")
        if arrow
            DllCall("SetCursor", "ptr", arrow)
    }

    InvalidateOverlay() {
        if IsObject(this.Overlay)
            DllCall("InvalidateRect", "ptr", this.Overlay.Hwnd,
                "ptr", 0, "int", false)
    }

    OnEraseBackground(wParam, lParam, msg, hwnd) {
        return this.IsOverlayWindow(hwnd) ? 1 : ""
    }

    OnSetCursor(wParam, lParam, msg, hwnd) {
        if !this.IsOverlayWindow(hwnd)
            return
        cursor := DllCall("LoadCursorW", "ptr", 0, "ptr",
            ScreenshotManager.IDC_CROSS, "ptr")
        if cursor {
            DllCall("SetCursor", "ptr", cursor)
            return true
        }
    }

    OnKeyDown(wParam, lParam, msg, hwnd) {
        if wParam = 0x1B && this.IsOverlayWindow(hwnd) {
            this.CancelFromEscape()
            return 0
        }
    }

    OnPaint(wParam, lParam, msg, hwnd) {
        if !this.IsOverlayWindow(hwnd)
            return
        paint := Buffer(A_PtrSize = 8 ? 72 : 64, 0)
        hdc := DllCall("BeginPaint", "ptr", hwnd, "ptr", paint, "ptr")
        if !hdc
            return 0
        try this.PaintOverlay(hdc, hwnd)
        finally DllCall("EndPaint", "ptr", hwnd, "ptr", paint)
        return 0
    }

    PaintOverlay(hdc, hwnd) {
        this.PaintFrozenBase(hdc)
        this.PaintInstructions(hdc)
    }


    PaintSelectionBorder(hdc, left, top, right, bottom) {
        if right <= left || bottom <= top
            return
        borderWidth := ScreenshotManager.BORDER_WIDTH
        brush := DllCall("CreateSolidBrush", "uint",
            ScreenshotManager.ColorRef(ScreenshotManager.ACCENT), "ptr")
        if !brush
            return
        try {
            this.FillSolidRect(hdc, brush, left, top, right,
                Min(bottom, top + borderWidth))
            this.FillSolidRect(hdc, brush, left, Max(top, bottom - borderWidth),
                right, bottom)
            this.FillSolidRect(hdc, brush, left, top,
                Min(right, left + borderWidth), bottom)
            this.FillSolidRect(hdc, brush, Max(left, right - borderWidth), top,
                right, bottom)
        } finally DllCall("DeleteObject", "ptr", brush)
    }

    FillSolidRect(hdc, brush, left, top, right, bottom) {
        if right <= left || bottom <= top
            return
        rect := Buffer(16, 0)
        NumPut("int", left, rect, 0), NumPut("int", top, rect, 4)
        NumPut("int", right, rect, 8), NumPut("int", bottom, rect, 12)
        DllCall("FillRect", "ptr", hdc, "ptr", rect, "ptr", brush)
    }

    PaintFrozenBase(hdc) {
        clip := Buffer(16, 0)
        clipType := DllCall("GetClipBox", "ptr", hdc, "ptr", clip, "int")
        if clipType = 0
            return
        left := NumGet(clip, 0, "int"), top := NumGet(clip, 4, "int")
        right := NumGet(clip, 8, "int"), bottom := NumGet(clip, 12, "int")
        width := right - left, height := bottom - top
        if width <= 0 || height <= 0
            return

        if !this.FrozenDc || !DllCall("BitBlt", "ptr", hdc,
            "int", left, "int", top, "int", width, "int", height,
            "ptr", this.FrozenDc, "int", left, "int", top,
            "uint", ScreenshotManager.SRCCOPY) {
            fallback := Buffer(16, 0)
            NumPut("int", left, fallback, 0), NumPut("int", top, fallback, 4)
            NumPut("int", right, fallback, 8), NumPut("int", bottom, fallback, 12)
            brush := DllCall("CreateSolidBrush", "uint",
                ScreenshotManager.ColorRef(ScreenshotManager.OVERLAY), "ptr")
            try {
                if brush
                    DllCall("FillRect", "ptr", hdc, "ptr", fallback, "ptr", brush)
            }
            finally {
                if brush
                    DllCall("DeleteObject", "ptr", brush)
            }
            return
        }

        if this.DimDc {
            ; BLENDFUNCTION: AC_SRC_OVER with a constant black alpha and no per-pixel alpha.
            blend := ScreenshotManager.DIM_ALPHA << 16
            DllCall("msimg32\AlphaBlend", "ptr", hdc,
                "int", left, "int", top, "int", width, "int", height,
                "ptr", this.DimDc, "int", 0, "int", 0, "int", 1, "int", 1,
                "uint", blend, "int")
        }
    }

    PaintInstructions(hdc) {
        clip := Buffer(16, 0)
        if DllCall("GetClipBox", "ptr", hdc, "ptr", clip, "int") = 0
            return
        dpi := this.InstructionDpi
        instructionBandBottom := ScreenshotManager.ScaleDip(80, dpi)
        if NumGet(clip, 4, "int") >= instructionBandBottom
            || NumGet(clip, 12, "int") <= 0
            return
        instruction := "Select an area    Esc to cancel"
        font := ScreenshotManager.CreateFont(10, 600, dpi)
        oldFont := DllCall("SelectObject", "ptr", hdc, "ptr", font, "ptr")
        size := Buffer(8, 0)
        DllCall("GetTextExtentPoint32W", "ptr", hdc, "str", instruction,
            "int", StrLen(instruction), "ptr", size)
        paddingX := ScreenshotManager.ScaleDip(16, dpi)
        paddingY := ScreenshotManager.ScaleDip(9, dpi)
        width := NumGet(size, 0, "int") + paddingX * 2
        height := NumGet(size, 4, "int") + paddingY * 2
        left := Max(0, Floor((this.Bounds.Width - width) / 2))
        top := ScreenshotManager.ScaleDip(18, dpi)
        brush := DllCall("CreateSolidBrush", "uint",
            ScreenshotManager.ColorRef(ScreenshotManager.SURFACE), "ptr")
        pen := DllCall("CreatePen", "int", 0, "int", 1,
            "uint", ScreenshotManager.ColorRef(ScreenshotManager.ACCENT), "ptr")
        oldBrush := DllCall("SelectObject", "ptr", hdc, "ptr", brush, "ptr")
        oldPen := DllCall("SelectObject", "ptr", hdc, "ptr", pen, "ptr")
        radius := ScreenshotManager.ScaleDip(10, dpi)
        DllCall("RoundRect", "ptr", hdc, "int", left, "int", top,
            "int", left + width, "int", top + height,
            "int", radius, "int", radius)
        DllCall("SelectObject", "ptr", hdc, "ptr", oldPen)
        DllCall("SelectObject", "ptr", hdc, "ptr", oldBrush)
        DllCall("DeleteObject", "ptr", pen)
        DllCall("DeleteObject", "ptr", brush)
        oldMode := DllCall("SetBkMode", "ptr", hdc, "int", 1, "int")
        oldColor := DllCall("SetTextColor", "ptr", hdc,
            "uint", ScreenshotManager.ColorRef(ScreenshotManager.TEXT), "uint")
        DllCall("TextOutW", "ptr", hdc, "int", left + paddingX,
            "int", top + paddingY, "str", instruction, "int", StrLen(instruction))
        DllCall("SetTextColor", "ptr", hdc, "uint", oldColor)
        DllCall("SetBkMode", "ptr", hdc, "int", oldMode)
        DllCall("SelectObject", "ptr", hdc, "ptr", oldFont)
        DllCall("DeleteObject", "ptr", font)
    }

    static CreateFont(points, weight, dpi) {
        height := -DllCall("MulDiv", "int", points, "int", dpi, "int", 72, "int")
        return DllCall("CreateFontW", "int", height, "int", 0, "int", 0,
            "int", 0, "int", weight, "uint", 0, "uint", 0, "uint", 0,
            "uint", 1, "uint", 0, "uint", 0, "uint", 5, "uint", 0,
            "str", "Segoe UI Variable Text", "ptr")
    }

    static ColorRef(rgb) {
        return ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF)
    }

    static FlushDesktopComposition() {
        try {
            if DllCall("dwmapi\DwmFlush", "int") = 0
                return
        }
        ; Composition can be unavailable in classic or remote sessions.
        Sleep(8)
    }

    Shutdown(notify := false) {
        if this.Stopped
            return
        this.Stopped := true
        wasActive := this.Active
        previous := this.PreviousForeground
        this.CleanupOverlay()
        this.Active := false
        this.PreviousForeground := 0
        if this.MessagesRegistered {
            try OnMessage(0x0201, this.MouseDownHandler, 0)
            try OnMessage(0x0200, this.MouseMoveHandler, 0)
            try OnMessage(0x0202, this.MouseUpHandler, 0)
            try OnMessage(0x000F, this.PaintHandler, 0)
            try OnMessage(0x0014, this.EraseHandler, 0)
            try OnMessage(0x0020, this.CursorHandler, 0)
            try OnMessage(0x0100, this.KeyHandler, 0)
            this.MessagesRegistered := false
        }
        try OnExit(this.ExitHandler, 0)
        if notify && wasActive && IsObject(this.FinishedCallback)
            try this.FinishedCallback.Call("cancelled", previous,
                {Status: "cancelled", OverlayLatencyMs: this.OverlayLatencyMs,
                    CompletionLatencyMs: 0.0})
    }

    OnProcessExit(*) => this.Shutdown(false)

    __Delete() {
        try this.Shutdown(false)
    }

    static Qpc() {
        value := 0
        DllCall("QueryPerformanceCounter", "int64*", &value)
        return value
    }

    static QpcMs(start) {
        now := 0, frequency := 0
        DllCall("QueryPerformanceCounter", "int64*", &now)
        DllCall("QueryPerformanceFrequency", "int64*", &frequency)
        return frequency ? (now - start) * 1000.0 / frequency : 0.0
    }
}
