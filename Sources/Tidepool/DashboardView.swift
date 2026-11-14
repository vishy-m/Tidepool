import AppKit
import SwiftUI
import WebKit

/// The main window: a gallery of every wallpaper with live previews, and the chosen one's settings.
struct DashboardView: View {
    @ObservedObject var state: AppState

    private let columns = [GridItem(.adaptive(minimum: 230, maximum: 340), spacing: 18)]

    var body: some View {
        HStack(spacing: 0) {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 18) {
                    ForEach(state.wallpapers) { wallpaper in
                        WallpaperCard(wallpaper: wallpaper, selected: wallpaper.id == state.current?.id) {
                            state.select(wallpaper.id)
                        }
                    }
                }
                .padding(20)
            }
            .frame(minWidth: 520)

            Divider()

            settings.frame(width: 340)
        }
        .frame(minWidth: 880, minHeight: 540)
    }

    private var settings: some View {
        Form {
            Section {
                Text(state.current?.manifest.name ?? "No wallpaper").font(.title3.bold())
                if let description = state.current?.manifest.description {
                    Text(description).font(.callout).foregroundStyle(.secondary)
                }
                Toggle("Paused", isOn: Binding(get: { state.paused }, set: { state.setPaused($0) }))
            }

            if let specs = state.current?.settings, !specs.isEmpty {
                Section {
                    ForEach(specs) { row($0) }
                }
                Section {
                    Button("Reset to Defaults") { state.resetCurrent() }
                }
            }

            Section("Tidepool") {
                Toggle("Pause while using apps", isOn: Binding(
                    get: { state.pausesForApps }, set: { state.setPausesForApps($0) }))
                Toggle("Launch at login", isOn: Binding(
                    get: { state.launchesAtLogin }, set: { state.setLaunchesAtLogin($0) }))
                Button("Reload Wallpapers") { state.reloadLibrary() }
                Button("Open Wallpapers Folder") { NSWorkspace.shared.open(WallpaperLibrary.userFolder) }
                Button("Quit Tidepool", role: .destructive) { state.onQuit?() }
            }
        }
        .formStyle(.grouped)
    }

    @ViewBuilder
    private func row(_ spec: SettingSpec) -> some View {
        switch spec.type {
        case .toggle:
            Toggle(spec.label, isOn: Binding(
                get: { state.values[spec.key]?.bool ?? spec.default.bool ?? false },
                set: { state.set(spec.key, .bool($0)) }
            ))

        case .range:
            let value = state.values[spec.key]?.double ?? spec.default.double ?? 0
            let step = spec.step ?? 0.01
            LabeledContent(spec.label) {
                HStack {
                    Slider(
                        value: Binding(get: { value }, set: { state.set(spec.key, .number($0)) }),
                        in: (spec.min ?? 0)...(spec.max ?? 1), step: step)
                    Text(String(format: step >= 1 ? "%.0f" : "%.2f", value))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                        .frame(width: 40, alignment: .trailing)
                }
            }

        case .select:
            Picker(spec.label, selection: Binding(
                get: { state.values[spec.key] ?? spec.default },
                set: { state.set(spec.key, $0) }
            )) {
                ForEach(spec.options ?? [], id: \.self) { Text($0.label).tag($0.value) }
            }

        case .color:
            ColorPicker(spec.label, selection: Binding(
                get: { Color(hex: state.values[spec.key]?.string ?? spec.default.string ?? "#ffffff") },
                set: { state.set(spec.key, .string($0.hex)) }
            ), supportsOpacity: false)
        }
    }
}

private struct WallpaperCard: View {
    let wallpaper: Wallpaper
    let selected: Bool
    let choose: () -> Void

    var body: some View {
        Button(action: choose) {
            VStack(alignment: .leading, spacing: 6) {
                WallpaperPreview(wallpaper: wallpaper)
                    .allowsHitTesting(false)
                    .aspectRatio(16 / 10, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .strokeBorder(selected ? Color.accentColor : Color.primary.opacity(0.12),
                                          lineWidth: selected ? 3 : 1))
                HStack(spacing: 5) {
                    Text(wallpaper.manifest.name).font(.headline)
                    if selected {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor)
                    }
                }
                Text(wallpaper.manifest.description ?? " ")
                    .font(.caption).foregroundStyle(.secondary)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The wallpaper itself running in miniature, with its default settings.
private struct WallpaperPreview: NSViewRepresentable {
    let wallpaper: Wallpaper

    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.setValue(false, forKey: "drawsBackground")
        view.pageZoom = 0.25 // the page sees a screen four times the card's size
        // Nine live pages are a lot to animate at once; half the frame rate is plenty at this size.
        var page = URLComponents(url: wallpaper.entryURL, resolvingAgainstBaseURL: false)
        page?.queryItems = [URLQueryItem(name: "fps", value: "30")]
        view.loadFileURL(page?.url ?? wallpaper.entryURL, allowingReadAccessTo: wallpaper.folder.deletingLastPathComponent())
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {}
}

private extension Color {
    init(hex: String) {
        let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let n = UInt32(digits, radix: 16) ?? 0xFFFFFF
        self.init(.sRGB,
                  red: Double((n >> 16) & 0xFF) / 255,
                  green: Double((n >> 8) & 0xFF) / 255,
                  blue: Double(n & 0xFF) / 255)
    }

    var hex: String {
        let c = NSColor(self).usingColorSpace(.sRGB) ?? .white
        return String(format: "#%02x%02x%02x",
                      Int((c.redComponent * 255).rounded()),
                      Int((c.greenComponent * 255).rounded()),
                      Int((c.blueComponent * 255).rounded()))
    }
}
