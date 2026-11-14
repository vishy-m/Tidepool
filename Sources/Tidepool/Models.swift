import Foundation

/// A setting value as it appears in a manifest and as it is handed to the wallpaper's JavaScript.
enum JSONValue: Codable, Hashable {
    case bool(Bool)
    case number(Double)
    case string(String)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else {
            self = .string(try c.decode(String.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        }
    }

    var double: Double? { if case .number(let n) = self { return n } else { return nil } }
    var bool: Bool? { if case .bool(let b) = self { return b } else { return nil } }
    var string: String? { if case .string(let s) = self { return s } else { return nil } }
}

struct SettingSpec: Codable, Identifiable {
    enum Kind: String, Codable { case range, toggle, select, color }
    struct Option: Codable, Hashable {
        let value: JSONValue
        let label: String
    }

    let key: String
    let label: String
    let type: Kind
    let `default`: JSONValue
    var min: Double?
    var max: Double?
    var step: Double?
    var options: [Option]?

    var id: String { key }
}

struct Manifest: Codable {
    let name: String
    var description: String?
    var entry: String?
    var settings: [SettingSpec]?
}

struct Wallpaper: Identifiable {
    let id: String
    let folder: URL
    let manifest: Manifest

    var entryURL: URL { folder.appendingPathComponent(manifest.entry ?? "index.html") }
    var settings: [SettingSpec] { manifest.settings ?? [] }
}

enum WallpaperLibrary {
    /// Wallpapers you add yourself live here; a folder with the same name as a built-in one replaces it.
    static var userFolder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Tidepool/Wallpapers", isDirectory: true)
    }

    static var bundledFolder: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("Wallpapers", isDirectory: true)
    }

    static func load() -> [Wallpaper] {
        let fm = FileManager.default
        try? fm.createDirectory(at: userFolder, withIntermediateDirectories: true)

        var byID: [String: Wallpaper] = [:]
        for root in [bundledFolder, userFolder].compactMap({ $0 }) {
            let folders = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
            for folder in folders {
                let manifestURL = folder.appendingPathComponent("manifest.json")
                guard let data = try? Data(contentsOf: manifestURL) else { continue }
                do {
                    let manifest = try JSONDecoder().decode(Manifest.self, from: data)
                    let id = folder.lastPathComponent
                    byID[id] = Wallpaper(id: id, folder: folder, manifest: manifest)
                } catch {
                    NSLog("Tidepool: skipping %@ — bad manifest.json: %@", folder.path, String(describing: error))
                }
            }
        }
        return byID.values.sorted { $0.manifest.name.localizedCaseInsensitiveCompare($1.manifest.name) == .orderedAscending }
    }
}
