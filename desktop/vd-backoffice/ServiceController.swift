import AppKit
import Foundation
import SwiftUI

@MainActor
final class ServiceController: ObservableObject {
  enum HealthState: Equatable {
    case recipesService
    case otherService
    case unavailable
  }

  enum State: Equatable {
    case stopped
    case starting
    case running
    case failed(String)
  }

  @Published private(set) var state: State = .stopped
  @Published private(set) var lastLogLine: String?
  @Published private(set) var activePort: Int
  @Published private(set) var studioMeta: StudioMeta?
  @Published private(set) var isSyncingPreview = false
  @Published private(set) var lastSyncSummary: String?

  let repositoryRoot: String
  private let serviceScriptPath: String
  private let envFilePath: String
  private let defaultPort: Int
  private let previewSyncScriptPath: String

  init(repositoryRoot: String, serviceScriptPath: String, envFilePath: String, previewSyncScriptPath: String, port: Int) {
    self.repositoryRoot = repositoryRoot
    self.serviceScriptPath = serviceScriptPath
    self.envFilePath = envFilePath
    self.defaultPort = port
    self.previewSyncScriptPath = previewSyncScriptPath
    self.activePort = port

    DispatchQueue.main.async { [weak self] in
      self?.startIfNeeded()
    }
  }

  var statusTitle: String {
    switch state {
    case .stopped: return "Service arrete"
    case .starting: return "Demarrage en cours"
    case .running: return "Service actif"
    case .failed: return "Service en erreur"
    }
  }

  var statusMessage: String {
    switch state {
    case .stopped:
      return "Le back-office local n'est pas encore lance."
    case .starting:
      return "La console locale recette demarre sur http://127.0.0.1:\(activePort)."
    case .running:
      if let preview = activePreviewTarget, let name = preview.name {
        return "Back-office disponible sur http://127.0.0.1:\(activePort), aligne sur \(name)."
      }
      return "Back-office disponible sur http://127.0.0.1:\(activePort) avec les cookies et la navigation gardes dans l'app."
    case .failed(let message):
      return message
    }
  }

  var statusColor: Color {
    switch state {
    case .stopped: return .gray
    case .starting: return .orange
    case .running: return .green
    case .failed: return .red
    }
  }

  var isReady: Bool {
    if case .running = state {
      return true
    }
    return false
  }

  var activePreviewTarget: PreviewTarget? {
    guard let preview = studioMeta?.shopify.previewTarget, preview.ok else { return nil }
    return preview
  }

  var previewTitle: String {
    activePreviewTarget?.name ?? "Preview QA auto"
  }

  var previewSubtitle: String {
    if let preview = activePreviewTarget,
       let version = preview.version,
       let role = preview.role,
       let id = preview.id {
      return "v\(version) · \(role) · #\(id)"
    }

    return studioMeta?.shopify.previewTarget.error ?? "Resolution automatique de la preview la plus recente."
  }

  var canSyncPreview: Bool {
    studioMeta?.shopify.cliAvailable == true && activePreviewTarget != nil && isReady
  }

  var moduleSnapshot: [StudioModule] {
    studioMeta?.modules ?? []
  }

  func startIfNeeded() {
    if state == .starting || state == .running { return }
    Task {
      let preferredPort = await resolvePort()
      activePort = preferredPort
      if await healthcheck(port: preferredPort) == .recipesService {
        state = .running
        await refreshStudioMeta()
      } else {
        start()
      }
    }
  }

  func restart() {
    state = .stopped
    stopDetachedServices()
    startIfNeeded()
  }

  func start() {
    if state == .starting || state == .running { return }

    Task {
      state = .starting
      activePort = await resolvePort()

      if await healthcheck(port: activePort) == .recipesService {
        state = .running
        return
      }

      var environment = ProcessInfo.processInfo.environment
      environment["VD_RECIPES_PORT"] = String(activePort)
      loadEnvFile().forEach { key, value in
        environment[key] = value
      }
      let logsDirectory = NSString(string: "~/Library/Logs").expandingTildeInPath
      let launchProcess = Process()
      launchProcess.executableURL = URL(fileURLWithPath: "/bin/zsh")
      launchProcess.currentDirectoryURL = URL(fileURLWithPath: repositoryRoot)

      let exportLines = environment
        .filter { key, _ in key.hasPrefix("VD_RECIPES_") || key.hasPrefix("SHOPIFY_") }
        .map { key, value in
          "export \(key)=\(shellEscape(value))"
        }
        .sorted()
        .joined(separator: "; ")

      let launchCommand = [
        "cd \(shellEscape(repositoryRoot))",
        "mkdir -p \(shellEscape(logsDirectory))",
        exportLines,
        "/usr/bin/ruby \(shellEscape(serviceScriptPath)) >> \(shellEscape(logFilePath())) 2>&1 </dev/null &!"
      ]
        .filter { !$0.isEmpty }
        .joined(separator: "; ")

      launchProcess.arguments = ["-lc", launchCommand]

      do {
        try launchProcess.run()
        launchProcess.waitUntilExit()
      } catch {
        state = .failed("Impossible de lancer le service Ruby: \(error.localizedDescription)")
        return
      }

      for _ in 0..<40 {
        if await healthcheck(port: activePort) == .recipesService {
          lastLogLine = "Service local actif sur le port \(activePort)."
          state = .running
          await refreshStudioMeta()
          return
        }
        try? await Task.sleep(for: .milliseconds(250))
      }

      lastLogLine = tailLogLine()
      state = .failed("Le service a ete lance mais n'a pas repondu assez vite sur http://127.0.0.1:\(activePort).")
    }
  }

  func canOpen(section: StudioSection) -> Bool {
    isReady && localURL(for: section) != nil
  }

  func localURL(for section: StudioSection) -> URL? {
    let resolvedPath = studioMeta?.modules.first(where: { $0.key == section.rawValue })?.localPath ?? section.localPath
    guard let localPath = resolvedPath else { return nil }
    return URL(string: "http://127.0.0.1:\(activePort)\(localPath)")
  }

  func openCurrentInBrowser(section: StudioSection) {
    guard let url = localURL(for: section) else { return }
    NSWorkspace.shared.open(url)
  }

  func openPreview() {
    guard let raw = activePreviewTarget?.previewURL, let url = URL(string: raw) else { return }
    NSWorkspace.shared.open(url)
  }

  func openThemeEditor() {
    guard let raw = activePreviewTarget?.editorURL, let url = URL(string: raw) else { return }
    NSWorkspace.shared.open(url)
  }

  func openRepository() {
    NSWorkspace.shared.open(URL(fileURLWithPath: repositoryRoot))
  }

  func openStudioSettings() {
    guard let path = studioMeta?.settingsPath ?? studioMeta?.shopify.settingsPath else { return }
    NSWorkspace.shared.open(URL(fileURLWithPath: path))
  }

  func refreshMetadata() {
    Task {
      await refreshStudioMeta()
    }
  }

  func syncPreview() {
    guard !isSyncingPreview else { return }

    Task {
      isSyncingPreview = true
      defer { isSyncingPreview = false }

      var environment = ProcessInfo.processInfo.environment
      loadEnvFile().forEach { key, value in
        environment[key] = value
      }

      let process = Process()
      process.executableURL = URL(fileURLWithPath: "/usr/bin/ruby")
      process.currentDirectoryURL = URL(fileURLWithPath: repositoryRoot)
      process.arguments = [previewSyncScriptPath]
      process.environment = environment

      do {
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        lastSyncSummary = output.isEmpty ? "Synchronisation preview terminee." : output
        lastLogLine = "Preview cible synchronisee."
      } catch {
        lastSyncSummary = "Echec sync preview: \(error.localizedDescription)"
        lastLogLine = lastSyncSummary
      }

      await refreshStudioMeta()
    }
  }

  private func loadEnvFile() -> [String: String] {
    guard FileManager.default.fileExists(atPath: envFilePath),
          let content = try? String(contentsOfFile: envFilePath, encoding: .utf8) else {
      return [:]
    }

    return content.split(whereSeparator: \.isNewline).reduce(into: [:]) { result, rawLine in
      let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !line.isEmpty, !line.hasPrefix("#"), let separator = line.firstIndex(of: "=") else { return }
      let key = String(line[..<separator]).trimmingCharacters(in: .whitespaces)
      let value = String(line[line.index(after: separator)...]).trimmingCharacters(in: .whitespaces)
      guard !key.isEmpty else { return }
      result[key] = value.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }
  }

  private func resolvePort() async -> Int {
    let preferredPort = configuredPort()
    let preferredState = await healthcheck(port: preferredPort)
    if preferredState == .recipesService || preferredState == .unavailable {
      return preferredPort
    }

    for candidate in preferredPort..<4600 {
      let state = await healthcheck(port: candidate)
      if state == .recipesService || state == .unavailable {
        return candidate
      }
    }

    return preferredPort
  }

  private func configuredPort() -> Int {
    let env = loadEnvFile()
    if let customPort = env["VD_RECIPES_PORT"], let number = Int(customPort), number > 0 {
      return number
    }
    return defaultPort
  }

  private func logFilePath() -> String {
    let directory = NSString(string: "~/Library/Logs").expandingTildeInPath
    return directory + "/vd-backoffice.log"
  }

  private func tailLogLine() -> String? {
    let path = logFilePath()
    guard let contents = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
    return contents.split(whereSeparator: \.isNewline).last.map(String.init)
  }

  private func stopDetachedServices() {
    let killer = Process()
    killer.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
    killer.arguments = ["-f", serviceScriptPath]
    try? killer.run()
    killer.waitUntilExit()
  }

  private func shellEscape(_ value: String) -> String {
    "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
  }

  private func healthcheck(port: Int) async -> HealthState {
    guard let url = URL(string: "http://127.0.0.1:\(port)/health") else { return .unavailable }
    var request = URLRequest(url: url)
    request.timeoutInterval = 1.2

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else { return .otherService }
      guard (200..<300).contains(http.statusCode) else { return .otherService }
      guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return .otherService }
      return (payload["service"] as? String) == "recipes-service" ? .recipesService : .otherService
    } catch {
      return .unavailable
    }
  }

  private func refreshStudioMeta() async {
    guard let url = URL(string: "http://127.0.0.1:\(activePort)/studio/meta") else { return }
    var request = URLRequest(url: url)
    request.timeoutInterval = 2.0

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }
      let decoded = try JSONDecoder().decode(StudioMeta.self, from: data)
      studioMeta = decoded
    } catch {
      lastLogLine = "Meta studio indisponible: \(error.localizedDescription)"
    }
  }
}
