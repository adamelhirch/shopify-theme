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

  let repositoryRoot: String
  private let serviceScriptPath: String
  private let envFilePath: String
  private let defaultPort: Int

  init(repositoryRoot: String, serviceScriptPath: String, envFilePath: String, port: Int) {
    self.repositoryRoot = repositoryRoot
    self.serviceScriptPath = serviceScriptPath
    self.envFilePath = envFilePath
    self.defaultPort = port
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

  func startIfNeeded() {
    if state == .starting || state == .running { return }
    Task {
      let preferredPort = await resolvePort()
      activePort = preferredPort
      if await healthcheck(port: preferredPort) == .recipesService {
        state = .running
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
          return
        }
        try? await Task.sleep(for: .milliseconds(250))
      }

      lastLogLine = tailLogLine()
      state = .failed("Le service a ete lance mais n'a pas repondu assez vite sur http://127.0.0.1:\(activePort).")
    }
  }

  func canOpen(section: StudioSection) -> Bool {
    localURL(for: section) != nil
  }

  func localURL(for section: StudioSection) -> URL? {
    guard let localPath = section.localPath else { return nil }
    return URL(string: "http://127.0.0.1:\(activePort)\(localPath)")
  }

  func openCurrentInBrowser(section: StudioSection) {
    guard let url = localURL(for: section) else { return }
    NSWorkspace.shared.open(url)
  }

  func openPreview() {
    guard let url = URL(string: "https://4bru0c-p4.myshopify.com?preview_theme_id=181102379275") else { return }
    NSWorkspace.shared.open(url)
  }

  func openThemeEditor() {
    guard let url = URL(string: "https://4bru0c-p4.myshopify.com/admin/themes/181102379275/editor") else { return }
    NSWorkspace.shared.open(url)
  }

  func openRepository() {
    NSWorkspace.shared.open(URL(fileURLWithPath: repositoryRoot))
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
}
