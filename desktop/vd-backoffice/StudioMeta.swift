import Foundation

struct StudioMeta: Decodable {
  let ok: Bool?
  let service: String
  let version: Int
  let backend: String
  let modules: [StudioModule]
  let contentModules: [String]?
  let shopify: ShopifyStudioMeta
  let repositoryRoot: String?
  let settingsPath: String?

  enum CodingKeys: String, CodingKey {
    case ok
    case service
    case version
    case backend
    case modules
    case contentModules = "content_modules"
    case shopify
    case repositoryRoot = "repository_root"
    case settingsPath = "settings_path"
  }
}

struct StudioModuleContentResponse: Decodable {
  let modules: [String: StudioModuleContent]
}

struct StudioModuleContent: Decodable {
  let key: String
  let headline: String
  let body: String
  let pillars: [String]
  let collections: [StudioCollection]
  let roadmap: [String]
  let quickActions: [String]
  let stats: [StudioStat]

  enum CodingKeys: String, CodingKey {
    case key
    case headline
    case body
    case pillars
    case collections
    case roadmap
    case quickActions = "quick_actions"
    case stats
  }
}

struct StudioCollection: Decodable, Identifiable {
  let title: String
  let description: String
  let count: Int

  var id: String { title }
}

struct StudioStat: Decodable, Identifiable {
  let label: String
  let value: StudioStatValue

  var id: String { label }
}

enum StudioStatValue: Decodable {
  case integer(Int)
  case text(String)

  var displayValue: String {
    switch self {
    case .integer(let value): return String(value)
    case .text(let value): return value
    }
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let intValue = try? container.decode(Int.self) {
      self = .integer(intValue)
    } else {
      self = .text(try container.decode(String.self))
    }
  }
}

struct StudioModule: Decodable, Identifiable {
  let key: String
  let title: String
  let summary: String
  let status: String
  let enabled: Bool
  let localPath: String?

  var id: String { key }

  enum CodingKeys: String, CodingKey {
    case key
    case title
    case summary
    case status
    case enabled
    case localPath = "local_path"
  }
}

struct ShopifyStudioMeta: Decodable {
  let configured: Bool
  let cliAvailable: Bool
  let storeDomain: String
  let apiVersion: String
  let previewThemePrefix: String
  let previewExcludeNames: [String]
  let previewRoleAllowlist: [String]
  let settingsPath: String
  let previewTarget: PreviewTarget

  enum CodingKeys: String, CodingKey {
    case configured
    case cliAvailable = "cli_available"
    case storeDomain = "store_domain"
    case apiVersion = "api_version"
    case previewThemePrefix = "preview_theme_prefix"
    case previewExcludeNames = "preview_exclude_names"
    case previewRoleAllowlist = "preview_role_allowlist"
    case settingsPath = "settings_path"
    case previewTarget = "preview_target"
  }
}

struct PreviewTarget: Decodable {
  let ok: Bool
  let error: String?
  let id: Int?
  let name: String?
  let version: String?
  let role: String?
  let previewURL: String?
  let editorURL: String?
  let storeDomain: String?
  let resolutionStrategy: String?

  enum CodingKeys: String, CodingKey {
    case ok
    case error
    case id
    case name
    case version
    case role
    case previewURL = "preview_url"
    case editorURL = "editor_url"
    case storeDomain = "store_domain"
    case resolutionStrategy = "resolution_strategy"
  }
}
