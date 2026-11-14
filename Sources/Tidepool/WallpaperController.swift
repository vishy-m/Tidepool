import AppKit
import WebKit

private final class DesktopWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// One screen's wallpaper: a borderless window at desktop level (above the system wallpaper,
/// below Finder's icons) hosting the wallpaper's web page.
@MainActor
final class WallpaperController: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    let screen: NSScreen
    private let window: NSWindow
    private var webView: WKWebView?
    private var pointerInside = false
    private var userPaused = false
    private var sentPaused = false

    init(screen: NSScreen) {
        self.screen = screen
        window = DesktopWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        super.init()

        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.isReleasedWhenClosed = false
        window.hasShadow = false
        window.backgroundColor = .black
        window.setFrame(screen.frame, display: true)
        window.orderFront(nil)

        NotificationCenter.default.addObserver(
            self, selector: #selector(occlusionChanged),
            name: NSWindow.didChangeOcclusionStateNotification, object: window)
    }

    func close() {
        NotificationCenter.default.removeObserver(self)
        window.close()
    }

    func load(_ wallpaper: Wallpaper?, settingsJSON: String) {
        webView?.removeFromSuperview()
        webView = nil
        pointerInside = false
        sentPaused = false
        guard let wallpaper else { return }

        let config = WKWebViewConfiguration()
        config.userContentController.addUserScript(WKUserScript(
            source: Self.bridgeSource.replacingOccurrences(of: "__SETTINGS__", with: settingsJSON),
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        config.userContentController.add(WeakMessageHandler(self), name: "log")

        let view = WKWebView(frame: window.contentLayoutRect, configuration: config)
        view.autoresizingMask = [.width, .height]
        view.navigationDelegate = self
        view.isInspectable = true
        window.contentView = view
        webView = view
        // Read access covers the whole Wallpapers folder so pages can share scripts (../_shared/).
        view.loadFileURL(wallpaper.entryURL, allowingReadAccessTo: wallpaper.folder.deletingLastPathComponent())
    }

    func emit(_ type: String, _ detailJSON: String = "null") {
        webView?.evaluateJavaScript("window.wallpaper && window.wallpaper._emit('\(type)', \(detailJSON))")
    }

    /// `location` is in global screen coordinates (origin bottom-left), as NSEvent reports it;
    /// nil means the cursor is over an app window rather than the desktop.
    func pointerMoved(to location: NSPoint?) {
        if let location, let p = localPoint(location) {
            pointerInside = true
            emit("pointermove", p)
        } else if pointerInside {
            pointerInside = false
            emit("pointerleave")
        }
    }

    func clicked(at location: NSPoint) {
        if let p = localPoint(location) { emit("click", p) }
    }

    func setUserPaused(_ paused: Bool) {
        userPaused = paused
        syncPaused()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        sentPaused = false
        syncPaused()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("Tidepool: wallpaper failed to load: %@", String(describing: error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("Tidepool: wallpaper failed to load: %@", String(describing: error))
    }

    /// Script errors in the page end up in the app's log (Console.app, or stderr when run from a terminal).
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        NSLog("Tidepool: wallpaper script: %@", String(describing: message.body))
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        NSLog("Tidepool: the wallpaper's web process quit; reloading")
        webView.reload()
    }

    /// Page coordinates (origin top-left, in CSS pixels) or nil when the point is on another screen.
    private func localPoint(_ location: NSPoint) -> String? {
        let frame = screen.frame
        guard frame.contains(location) else { return nil }
        return String(format: "{\"x\":%.1f,\"y\":%.1f}", location.x - frame.minX, frame.maxY - location.y)
    }

    @objc private func occlusionChanged() { syncPaused() }

    /// Wallpapers stop drawing while paused from the menu or fully covered by other windows.
    private func syncPaused() {
        let shouldPause = userPaused || !window.occlusionState.contains(.visible)
        guard shouldPause != sentPaused else { return }
        sentPaused = shouldPause
        emit(shouldPause ? "pause" : "resume")
    }

    /// Defines `window.wallpaper` before the page's own scripts run.
    private static let bridgeSource = """
    (() => {
      const report = (text) => window.webkit.messageHandlers.log.postMessage(String(text));
      window.addEventListener('error', (e) => report(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
      window.addEventListener('unhandledrejection', (e) => report(e.reason));
      const handlers = {};
      window.wallpaper = {
        host: 'tidepool',
        settings: __SETTINGS__,
        pointer: { x: 0, y: 0, inside: false },
        paused: false,
        on(type, fn) { (handlers[type] || (handlers[type] = [])).push(fn); return this; },
        _emit(type, detail) {
          if (type === 'settings') Object.assign(this.settings, detail);
          else if (type === 'pointermove') this.pointer = { x: detail.x, y: detail.y, inside: true };
          else if (type === 'pointerleave') this.pointer.inside = false;
          else if (type === 'pause') this.paused = true;
          else if (type === 'resume') this.paused = false;
          for (const fn of handlers[type] || []) {
            try { fn(detail); } catch (error) { report(error); }
          }
        },
      };
    })();
    """
}

/// WKUserContentController keeps its handlers alive, which would otherwise keep the controller alive too.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
