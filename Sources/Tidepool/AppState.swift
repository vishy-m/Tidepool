import AppKit
import Foundation
import ServiceManagement

/// The chosen wallpaper and its setting values, persisted in UserDefaults.
@MainActor
final class AppState: ObservableObject {
    @Published private(set) var wallpapers: [Wallpaper] = []
    @Published private(set) var current: Wallpaper?
    @Published private(set) var values: [String: JSONValue] = [:]
    @Published private(set) var paused = false
    /// Whether the wallpaper stops while another app is in use. On unless switched off.
    @Published private(set) var pausesForApps = UserDefaults.standard.object(forKey: "pauseForApps") as? Bool ?? true
    @Published private(set) var launchesAtLogin = SMAppService.mainApp.status == .enabled

    var onWallpaperChange: (() -> Void)?
    var onSettingsChange: (() -> Void)?
    var onPauseChange: (() -> Void)?
    var onQuit: (() -> Void)?

    private let defaults = UserDefaults.standard
    private let currentKey = "currentWallpaper"

    func reloadLibrary() {
        wallpapers = WallpaperLibrary.load()
        let savedID = defaults.string(forKey: currentKey)
        let chosen = wallpapers.first { $0.id == savedID }
            ?? wallpapers.first { $0.id == "ascii-pond" }
            ?? wallpapers.first
        activate(chosen)
    }

    func select(_ id: String) {
        guard let wallpaper = wallpapers.first(where: { $0.id == id }) else { return }
        defaults.set(id, forKey: currentKey)
        activate(wallpaper)
    }

    func set(_ key: String, _ value: JSONValue) {
        guard values[key] != value else { return }
        values[key] = value
        persistValues()
        onSettingsChange?()
    }

    func resetCurrent() {
        guard let current else { return }
        defaults.removeObject(forKey: valuesKey(current.id))
        values = effectiveValues(for: current)
        onSettingsChange?()
    }

    func setPaused(_ value: Bool) {
        paused = value
        onPauseChange?()
    }

    func setPausesForApps(_ value: Bool) {
        pausesForApps = value
        defaults.set(value, forKey: "pauseForApps")
        onPauseChange?()
    }

    func setLaunchesAtLogin(_ value: Bool) {
        do {
            if value { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            let alert = NSAlert(error: error)
            alert.messageText = "Couldn't change Launch at Login"
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
        }
        launchesAtLogin = SMAppService.mainApp.status == .enabled
    }

    /// The current values as the JSON object handed to the wallpaper.
    var settingsJSON: String {
        guard let data = try? JSONEncoder().encode(values), let json = String(data: data, encoding: .utf8) else { return "{}" }
        return json
    }

    private func activate(_ wallpaper: Wallpaper?) {
        current = wallpaper
        values = wallpaper.map(effectiveValues) ?? [:]
        onWallpaperChange?()
    }

    /// Manifest defaults, overridden by whatever was saved for keys the manifest still declares.
    private func effectiveValues(for wallpaper: Wallpaper) -> [String: JSONValue] {
        var saved: [String: JSONValue] = [:]
        if let data = defaults.data(forKey: valuesKey(wallpaper.id)) {
            saved = (try? JSONDecoder().decode([String: JSONValue].self, from: data)) ?? [:]
        }
        var result: [String: JSONValue] = [:]
        for spec in wallpaper.settings {
            result[spec.key] = saved[spec.key] ?? spec.default
        }
        return result
    }

    private func persistValues() {
        guard let current, let data = try? JSONEncoder().encode(values) else { return }
        defaults.set(data, forKey: valuesKey(current.id))
    }

    private func valuesKey(_ id: String) -> String { "values.\(id)" }
}
