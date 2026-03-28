import SwiftUI

@main
struct VDBackofficeApp: App {
  @StateObject private var service = ServiceController(
    repositoryRoot: "__REPO_ROOT__",
    serviceScriptPath: "__REPO_ROOT__/apps/recipes-service/server.rb",
    envFilePath: "__REPO_ROOT__/apps/recipes-service/.env",
    previewSyncScriptPath: "__REPO_ROOT__/bin/theme-push-latest-preview.rb",
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
      return "Module editorial pour le wiki, avec publication et synchronisation future sur la bonne preview."
    case .pages:
      return "Poste de publication pour les pages editoriales, landings et experiences poussees."
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
    .navigationSplitViewColumnWidth(min: 250, ideal: 280, max: 320)
  }

  private var sidebar: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Vanille Desire")
          .font(.system(size: 28, weight: .bold, design: .rounded))
        Text("Cockpit editorial local pour Recettes, Wiki et Pages, synchronise sur la preview QA la plus recente.")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.secondary)
      }

      previewCard

      List(StudioSection.allCases, selection: $selection) { section in
        Label(section.title, systemImage: section.systemImage)
          .lineLimit(1)
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
          Label("Ouvrir la preview cible", systemImage: "sparkles.tv")
        }
        .buttonStyle(.bordered)
        .disabled(service.activePreviewTarget == nil)

        Button {
          service.openThemeEditor()
        } label: {
          Label("Theme editor cible", systemImage: "paintpalette")
        }
        .buttonStyle(.bordered)
        .disabled(service.activePreviewTarget == nil)

        Button {
          service.syncPreview()
        } label: {
          Label(service.isSyncingPreview ? "Sync en cours..." : "Synchroniser la preview", systemImage: "arrow.triangle.2.circlepath")
        }
        .buttonStyle(.borderedProminent)
        .disabled(!service.canSyncPreview || service.isSyncingPreview)

        Button {
          service.refreshMetadata()
        } label: {
          Label("Rafraichir le cockpit", systemImage: "rectangle.and.arrow.clockwise")
        }
        .buttonStyle(.bordered)

        Button {
          service.openStudioSettings()
        } label: {
          Label("Ouvrir la config studio", systemImage: "slider.horizontal.3")
        }
        .buttonStyle(.bordered)
        .disabled(service.studioMeta == nil)
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
    .frame(minWidth: 250, idealWidth: 280, maxWidth: 320, maxHeight: .infinity, alignment: .topLeading)
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

  private var previewCard: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Preview active")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)

      Text(service.previewTitle)
        .font(.title3.weight(.bold))

      Text(service.previewSubtitle)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)

      if let syncSummary = service.lastSyncSummary {
        Text(syncSummary)
          .font(.caption.monospaced())
          .foregroundStyle(.secondary)
          .lineLimit(4)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
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
        studioRibbon
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
        Text(service.previewTitle)
          .font(.caption.weight(.semibold))
          .foregroundStyle(section.accent)
      }

      Spacer()

      if section == .recipes {
        Button {
          service.openCurrentInBrowser(section: .recipes)
        } label: {
          Label("Safari", systemImage: "safari")
        }
        .buttonStyle(.bordered)

        Button {
          service.syncPreview()
        } label: {
          Label("Sync preview", systemImage: "arrow.triangle.2.circlepath")
        }
        .buttonStyle(.borderedProminent)
        .disabled(!service.canSyncPreview || service.isSyncingPreview)
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

  private var studioRibbon: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Preview QA cible")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.secondary)
        Text(service.previewTitle)
          .font(.headline)
        Text(service.previewSubtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Spacer()

      ForEach(service.moduleSnapshot.prefix(3)) { module in
        VStack(alignment: .leading, spacing: 2) {
          Text(module.title)
            .font(.caption.weight(.semibold))
          Text(module.status.capitalized)
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.72), in: Capsule())
      }
    }
    .padding(.horizontal, 24)
    .padding(.vertical, 14)
    .background(Color.white.opacity(0.82))
  }
}

struct PlaceholderSectionView: View {
  let section: StudioSection
  @EnvironmentObject private var service: ServiceController

  var body: some View {
    let module = service.moduleSnapshot.first(where: { $0.key == section.rawValue })
    let content = service.moduleContent(for: section)

    ScrollView {
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
              Text(content?.headline ?? section.summary)
                .font(.title3)
                .foregroundStyle(.secondary)
              Text(content?.body ?? "Le cockpit est deja pret pour accueillir ce module. On branchera ici un vrai poste editorial, avec publication souveraine et parcours qui ne dependent plus uniquement de la preview Shopify.")
                .font(.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

              if let module {
                HStack(spacing: 10) {
                  Text(module.title)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(Color.white.opacity(0.82), in: Capsule())
                  Text(module.status.capitalized)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(section.accent.opacity(0.12), in: Capsule())
                }
              }

              HStack(spacing: 12) {
                Button {
                  service.openThemeEditor()
                } label: {
                  Label("Theme editor", systemImage: "paintpalette")
                }
                .buttonStyle(.borderedProminent)
                .disabled(service.activePreviewTarget == nil)

                Button {
                  service.openPreview()
                } label: {
                  Label("Preview cible", systemImage: "sparkles.tv")
                }
                .buttonStyle(.bordered)
                .disabled(service.activePreviewTarget == nil)

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
          .frame(maxWidth: .infinity, minHeight: 340)

        if let content {
          moduleDashboard(content: content, accent: section.accent)
        } else {
          ProgressView("Chargement du module...")
            .frame(maxWidth: .infinity, minHeight: 240)
        }
      }
      .padding(32)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(red: 0.97, green: 0.96, blue: 0.94))
  }

  @ViewBuilder
  private func moduleDashboard(content: StudioModuleContent, accent: Color) -> some View {
    VStack(spacing: 20) {
      HStack(spacing: 14) {
        ForEach(content.stats) { stat in
          VStack(alignment: .leading, spacing: 10) {
            Text(stat.label)
              .font(.caption.weight(.semibold))
              .foregroundStyle(.secondary)
            Text(stat.value.displayValue)
              .font(.system(size: 28, weight: .bold, design: .rounded))
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(18)
          .background(Color.white.opacity(0.84), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
      }

      HStack(alignment: .top, spacing: 20) {
        VStack(alignment: .leading, spacing: 16) {
          moduleCard(title: "Piliers", accent: accent) {
            ForEach(content.pillars, id: \.self) { item in
              moduleRow(text: item)
            }
          }

          moduleCard(title: "Roadmap", accent: accent) {
            ForEach(content.roadmap, id: \.self) { item in
              moduleRow(text: item)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .top)

        VStack(alignment: .leading, spacing: 16) {
          moduleCard(title: "Collections", accent: accent) {
            ForEach(content.collections) { collection in
              VStack(alignment: .leading, spacing: 6) {
                HStack {
                  Text(collection.title)
                    .font(.headline)
                  Spacer()
                  Text(String(collection.count))
                    .font(.headline)
                    .foregroundStyle(accent)
                }
                Text(collection.description)
                  .font(.subheadline)
                  .foregroundStyle(.secondary)
              }
              .padding(14)
              .background(Color.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
          }

          moduleCard(title: "Actions rapides", accent: accent) {
            ForEach(content.quickActions, id: \.self) { item in
              moduleRow(text: item)
            }
          }
        }
        .frame(maxWidth: .infinity, alignment: .top)
      }
    }
  }

  private func moduleCard<Content: View>(title: String, accent: Color, @ViewBuilder content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(title)
        .font(.title3.weight(.bold))
      content()
    }
    .padding(22)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      LinearGradient(
        colors: [Color.white.opacity(0.92), accent.opacity(0.08)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      ),
      in: RoundedRectangle(cornerRadius: 24, style: .continuous)
    )
  }

  private func moduleRow(text: String) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(Color.black.opacity(0.7))
        .frame(width: 7, height: 7)
        .padding(.top, 6)
      Text(text)
        .font(.body)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
