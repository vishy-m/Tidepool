import AppKit
import ServiceManagement
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSWindowDelegate {
    private let state = AppState()
    private var controllers: [WallpaperController] = []
    private var statusItem: NSStatusItem!
    private let menu = NSMenu()
    private var dashboardWindow: NSWindow?
    private var pointerTimer: Timer?
    private var clickMonitor: Any?
    private var lastPointer = NSPoint(x: -1, y: -1)
    private var pointerOnDesktop = false
    private var lastDesktopCheck = Date.distantPast
    private var autoPaused = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        state.onWallpaperChange = { [weak self] in self?.loadWallpaper() }
        state.onSettingsChange = { [weak self] in
            guard let self else { return }
            self.controllers.forEach { $0.emit("settings", self.state.settingsJSON) }
        }
        state.onPauseChange = { [weak self] in
            guard let self else { return }
            self.updateAutoPause()
            self.applyPause()
        }
        state.onQuit = { NSApp.terminate(nil) }

        rebuildWindows()
        state.reloadLibrary()
        setUpStatusItem()
        startForwardingInput()
        openDashboard()

        NotificationCenter.default.addObserver(
            self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(
            self, selector: #selector(frontmostAppChanged),
            name: NSWorkspace.didActivateApplicationNotification, object: nil)
        updateAutoPause()
    }

    // MARK: Pausing

    @objc private func frontmostAppChanged() { updateAutoPause() }

    /// The wallpaper runs while the desktop is in use: Finder (or this app) is frontmost, or the
    /// cursor is over bare desktop. With another app in front and the cursor elsewhere, it stops.
    private func updateAutoPause() {
        let front = NSWorkspace.shared.frontmostApplication
        let desktopFocused = front?.bundleIdentifier == "com.apple.finder"
            || front?.processIdentifier == ProcessInfo.processInfo.processIdentifier
        let shouldPause = state.pausesForApps && !desktopFocused && !pointerOnDesktop
        guard shouldPause != autoPaused else { return }
        autoPaused = shouldPause
        applyPause()
    }

    private func applyPause() {
        controllers.forEach { $0.setUserPaused(state.paused || autoPaused) }
    }

    // MARK: Windows

    @objc private func screensChanged() {
        rebuildWindows()
        loadWallpaper()
    }

    private func rebuildWindows() {
        controllers.forEach { $0.close() }
        controllers = NSScreen.screens.map(WallpaperController.init)
        applyPause()
    }

    private func loadWallpaper() {
        controllers.forEach { $0.load(state.current, settingsJSON: state.settingsJSON) }
    }

    // MARK: Input

    /// The wallpaper window sits behind everything and never receives events itself, so the cursor
    /// position is polled and desktop clicks are observed globally, then handed to the page.
    private func startForwardingInput() {
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.pollPointer() }
        }
        RunLoop.main.add(timer, forMode: .common)
        pointerTimer = timer

        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: .leftMouseDown) { [weak self] _ in
            MainActor.assumeIsolated { self?.handleClick() }
        }
    }

    private func pollPointer() {
        let location = NSEvent.mouseLocation
        guard location != lastPointer, !state.paused else { return }
        lastPointer = location

        // The wallpaper only reacts to the cursor while it is over bare desktop; otherwise working
        // in a window would stir up whatever is behind it. Listing windows is not free, so the
        // answer is reused for a few frames.
        let now = Date()
        if now.timeIntervalSince(lastDesktopCheck) > 0.05 {
            lastDesktopCheck = now
            pointerOnDesktop = isDesktopVisible(at: location)
            updateAutoPause()
        }
        controllers.forEach { $0.pointerMoved(to: pointerOnDesktop ? location : nil) }
    }

    private func handleClick() {
        let location = NSEvent.mouseLocation
        guard !state.paused, isDesktopVisible(at: location) else { return }
        controllers.forEach { $0.clicked(at: location) }
    }

    /// True when no app window covers the point, i.e. the click landed on the desktop.
    private func isDesktopVisible(at location: NSPoint) -> Bool {
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(location) }),
              screen.visibleFrame.contains(location),  // not the menu bar or Dock
              let primary = NSScreen.screens.first else { return false }

        // Window bounds come back with a top-left origin on the primary screen.
        let point = CGPoint(x: location.x, y: primary.frame.maxY - location.y)
        let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
        for info in windows {
            // Negative layers are the desktop itself: icons, widgets and this app's wallpaper.
            guard let layer = info[kCGWindowLayer as String] as? Int, layer >= 0,
                  let alpha = info[kCGWindowAlpha as String] as? Double, alpha > 0,
                  let boundsDict = info[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: boundsDict) else { continue }
            if bounds.contains(point) { return false }
        }
        return true
    }

    // MARK: Menu

    private func setUpStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let image = NSImage(systemSymbolName: "fish.fill", accessibilityDescription: "Tidepool")
            ?? NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Tidepool")
        statusItem.button?.image = image
        // A plain click opens the dashboard; a right click (or control-click) shows the menu.
        statusItem.button?.target = self
        statusItem.button?.action = #selector(statusItemClicked)
        statusItem.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        menu.delegate = self
    }

    @objc private func statusItemClicked() {
        let event = NSApp.currentEvent
        if event?.type == .rightMouseUp || event?.modifierFlags.contains(.control) == true {
            statusItem.menu = menu
            statusItem.button?.performClick(nil)
            statusItem.menu = nil
        } else {
            openDashboard()
        }
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        add(menu, "Open Tidepool…", #selector(openDashboard), key: ",")
        menu.addItem(.separator())

        for wallpaper in state.wallpapers {
            let item = NSMenuItem(title: wallpaper.manifest.name, action: #selector(pickWallpaper(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = wallpaper.id
            item.state = wallpaper.id == state.current?.id ? .on : .off
            menu.addItem(item)
        }
        if state.wallpapers.isEmpty {
            menu.addItem(NSMenuItem(title: "No wallpapers found", action: nil, keyEquivalent: ""))
        }

        menu.addItem(.separator())
        add(menu, state.paused ? "Resume" : "Pause", #selector(togglePause), key: "p")
        let auto = add(menu, "Pause While Using Apps", #selector(togglePausesForApps))
        auto.state = state.pausesForApps ? .on : .off
        add(menu, "Reload Wallpapers", #selector(reload), key: "r")
        add(menu, "Open Wallpapers Folder", #selector(openFolder))

        menu.addItem(.separator())
        let login = add(menu, "Launch at Login", #selector(toggleLaunchAtLogin))
        login.state = state.launchesAtLogin ? .on : .off

        menu.addItem(.separator())
        add(menu, "Quit Tidepool", #selector(quit), key: "q")
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
        return item
    }

    @objc private func pickWallpaper(_ sender: NSMenuItem) {
        if let id = sender.representedObject as? String { state.select(id) }
    }

    /// Opening the app again while it is running (Finder, Spotlight, Dock) brings up the dashboard.
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openDashboard()
        return false
    }

    @objc private func openDashboard() {
        if dashboardWindow == nil {
            let window = NSWindow(contentViewController: NSHostingController(rootView: DashboardView(state: state)))
            window.title = "Tidepool"
            window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
            window.setContentSize(NSSize(width: 1040, height: 680))
            window.isReleasedWhenClosed = false
            window.delegate = self
            window.center()
            dashboardWindow = window
        }
        NSApp.activate(ignoringOtherApps: true)
        dashboardWindow?.makeKeyAndOrderFront(nil)
    }

    /// The previews are live pages, so the window is thrown away on close rather than kept running.
    func windowWillClose(_ notification: Notification) {
        guard (notification.object as? NSWindow) === dashboardWindow else { return }
        dashboardWindow?.contentViewController = nil
        dashboardWindow = nil
    }

    @objc private func togglePause() { state.setPaused(!state.paused) }

    @objc private func togglePausesForApps() {
        state.setPausesForApps(!state.pausesForApps)
    }

    @objc private func reload() { state.reloadLibrary() }

    @objc private func openFolder() { NSWorkspace.shared.open(WallpaperLibrary.userFolder) }

    @objc private func toggleLaunchAtLogin() { state.setLaunchesAtLogin(!state.launchesAtLogin) }

    @objc private func quit() { NSApp.terminate(nil) }
}
