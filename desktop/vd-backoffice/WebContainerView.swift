import SwiftUI
import WebKit

struct WebContainerView: NSViewRepresentable {
  let url: URL

  func makeNSView(context: Context) -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()

    let view = WKWebView(frame: .zero, configuration: configuration)
    view.allowsMagnification = true
    view.setValue(false, forKey: "drawsBackground")
    view.load(URLRequest(url: url))
    return view
  }

  func updateNSView(_ view: WKWebView, context: Context) {
    guard view.url != url else { return }
    view.load(URLRequest(url: url))
  }
}
