import SwiftUI

@main
struct VDBackofficeApp: App {
  @StateObject private var service = ServiceController(
    repositoryRoot: "__REPO_ROOT__",
    serviceScriptPath: "__REPO_ROOT__/apps/recipes-service/server.rb",
    envFilePath: "__REPO_ROOT__/apps/recipes-service/.env",
    port: 4567
  )
  @State private var selection: StudioSection? = .recipes

  var body: some Scene {
    WindowGroup("VD Backoffice") {
      ContentView(selection: $selection)
        .environmentObject(service)
        .frame(minWidth: 1240, minHeight: 820)
    }
    .windowToolbarStyle(.unified(showsTitle: true))
    .defaultSize(width: 1440, height: 920)
  }
}

enum StudioSection: String, CaseIterable, Identifiable {
  case recipes
  case wiki
  case pages

  var id: String { rawValue }

  var title: String {
    switch self {
    case .recipes: return "Recettes"
    case .wiki: return "Wiki"
    case .pages: return "Pages"
    }
  }

  var systemImage: String {
    switch self {
    case .recipes: return "fork.knife"
    case .wiki: return "book.closed"
    case .pages: return "doc.text"
    }
  }

  var accent: Color {
    switch self {
    case .recipes: return Color(red: 0.41, green: 0.53, blue: 0.39)
    case .wiki: return Color(red: 0.75, green: 0.52, blue: 0.28)
    case .pages: return Color(red: 0.33, green: 0.41, blue: 0.56)
    }
  }

  var localPath: String? {
    switch self {
    case .recipes: return "/admin/login"
    case .wiki: return nil
    case .pages: return nil
    }
  }

  var summary: String {
    switch self {
    case .recipes:
      return "Creation, import, moderation et publication Shopify des fiches recette."
    case .wiki:
      return "Prochain module pour piloter les contenus Wiki tres pousses depuis la meme app."
    case .pages:
      return "Futur poste de publication pour les pages editoriales qui depassent le simple cycle preview."
    }
  }
}

struct ContentView: View {
  @EnvironmentObject private var service: ServiceController
  @Binding var selection: StudioSection?

  var body: some View {
    NavigationSplitView {
      sidebar
    } detail: {
      detail
    }
    .navigationSplitViewStyle(.balanced)
  }

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Vanille Desire")
          .font(.system(size: 28, weight: .bold, design: .rounded))
        Text("Cockpit editorial local pour Recettes, puis Wiki et Pages.")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.secondary)
      }

      List(StudioSection.allCases, selection: $selection) { section in
        Label(section.title, systemImage: section.systemImage)
          .tag(section)
      }
      .listStyle(.sidebar)

      VStack(alignment: .leading, spacing: 12) {
        statusCard

        Button {
          service.restart()
        } label: {
          Label("Redemarrer le service", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)

        Button {
          service.openCurrentInBrowser(section: selection ?? .recipes)
        } label: {
          Label("Ouvrir dans le navigateur", systemImage: "safari")
        }
        .buttonStyle(.bordered)
        .disabled(!service.canOpen(section: selection ?? .recipes))

        Button {
          service.openPreview()
        } label: {
          Label("Ouvrir la preview 1.1.4", systemImage: "sparkles.tv")
        }
        .buttonStyle(.bordered)
      }

      Spacer()

      VStack(alignment: .leading, spacing: 6) {
        Text("Repo")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Text(service.repositoryRoot)
          .font(.caption.monospaced())
          .textSelection(.enabled)
          .foregroundStyle(.secondary)
      }
    }
    .padding(22)
    .background(
      LinearGradient(
        colors: [
          Color(red: 0.96, green: 0.94, blue: 0.91),
          Color(red: 0.92, green: 0.89, blue: 0.84)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    )
  }

  private var statusCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 10) {
        Circle()
          .fill(service.statusColor)
          .frame(width: 10, height: 10)
        Text(service.statusTitle)
          .font(.headline)
      }

      Text(service.statusMessage)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)

      if let lastLogLine = service.lastLogLine {
        Text(lastLogLine)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(3)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
  }

  @ViewBuilder
  private var detail: some View {
    let section = selection ?? .recipes
    if section == .recipes && !service.isReady {
      VStack(spacing: 18) {
        header(section: section)
        Spacer()
        ProgressView()
          .controlSize(.large)
        Text("Demarrage du back-office recette sur un port libre...")
          .font(.title3.weight(.semibold))
        Text(service.statusMessage)
          .font(.body)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 520)
        Button {
          service.restart()
        } label: {
          Label("Relancer le service", systemImage: "arrow.clockwise")
        }
        .buttonStyle(.borderedProminent)
        Spacer()
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color(red: 0.98, green: 0.97, blue: 0.95))
    } else if let localURL = service.localURL(for: section) {
      VStack(spacing: 0) {
        header(section: section)
        Divider()
        WebContainerView(url: localURL)
      }
    } else {
      PlaceholderSectionView(section: section)
        .environmentObject(service)
    }
  }

  private func header(section: StudioSection) -> some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 6) {
        Text(section.title)
          .font(.system(size: 30, weight: .bold, design: .rounded))
        Text(section.summary)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Spacer()

      if section == .recipes {
        Button {
          service.openCurrentInBrowser(section: .recipes)
        } label: {
          Label("Safari", systemImage: "safari")
        }
        .buttonStyle(.bordered)
      }
    }
    .padding(.horizontal, 24)
    .padding(.vertical, 18)
    .background(
      LinearGradient(
        colors: [
          section.accent.opacity(0.18),
          Color.white.opacity(0.72)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
    )
  }
}

struct PlaceholderSectionView: View {
  let section: StudioSection
  @EnvironmentObject private var service: ServiceController

  var body: some View {
    VStack(spacing: 22) {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              section.accent.opacity(0.16),
              Color.white.opacity(0.92)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .overlay(
          VStack(alignment: .leading, spacing: 18) {
            Label(section.title, systemImage: section.systemImage)
              .font(.system(size: 28, weight: .bold, design: .rounded))
            Text(section.summary)
              .font(.title3)
              .foregroundStyle(.secondary)
            Text("Le cockpit est deja pret pour accueillir ce module. On branchera ici un vrai poste editorial, avec publication souveraine et parcours qui ne dependent plus uniquement de la preview Shopify.")
              .font(.body)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 12) {
              Button {
                service.openThemeEditor()
              } label: {
                Label("Theme editor", systemImage: "paintpalette")
              }
              .buttonStyle(.borderedProminent)

              Button {
                service.openRepository()
              } label: {
                Label("Ouvrir le repo", systemImage: "folder")
              }
              .buttonStyle(.bordered)
            }
          }
          .padding(28),
          alignment: .topLeading
        )
        .frame(maxWidth: 880, maxHeight: 420)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(32)
    .background(Color(red: 0.97, green: 0.96, blue: 0.94))
  }
}
