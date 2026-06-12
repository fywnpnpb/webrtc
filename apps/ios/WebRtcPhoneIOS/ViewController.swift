import AVFoundation
import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private enum Config {
        // Replace this with your PC's LAN IP before running on a real iPhone.
        static let webAppURL = "http://localhost:8080"
        
    }

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground
        prepareAudioForCurrentDevice()
        setupWebView()
        loadWebApp()
    }

    private func setupWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(self, name: "iosLogger")
        configuration.userContentController.addUserScript(Self.consoleBridgeScript())
        configuration.mediaTypesRequiringUserActionForPlayback = []
        
        let preferences = WKWebpagePreferences()
        if #available(iOS 14.0, *) {
            preferences.allowsContentJavaScript = true
        }
        configuration.defaultWebpagePreferences = preferences

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsBackForwardNavigationGestures = false
        
        if #available(iOS 16.4, *){
            webView.isInspectable = true
        }
        
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
    }
    
    private func loadWebApp() {
        guard let url = URL(string: Config.webAppURL) else {
            print("Invalid Web app URL: \(Config.webAppURL)")
            return
        }

        print("Loading Web app URL: \(url.absoluteString)")
        webView.load(URLRequest(url: urlWithDevMode(url), cachePolicy: .reloadIgnoringLocalCacheData))
    }

    private func urlWithDevMode(_ url: URL) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }

        var items = components.queryItems ?? []
        if !items.contains(where: { $0.name == "dev" }) {
            items.append(URLQueryItem(name: "dev", value: "1"))
        }
        components.queryItems = items

        return components.url ?? url
    }

    private func prepareAudioForCurrentDevice() {
        #if targetEnvironment(simulator)
        print("Skipping native audio session setup on Simulator. Use a real iPhone for microphone call testing.")
        #else
        configureAudioSession()
        requestMicrophonePermission()
        #endif
    }

    private func configureAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
        } catch {
            print("Audio session setup failed: \(error.localizedDescription)")
        }
    }

    private func requestMicrophonePermission() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            print("Microphone permission granted: \(granted)")
        }
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        if type == .microphone || type == .cameraAndMicrophone {
            decisionHandler(.grant)
        } else {
            decisionHandler(.prompt)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("Web app loaded: \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logNavigationError(error, phase: "navigation")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logNavigationError(error, phase: "provisional navigation")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "iosLogger" else { return }
        print("Web console: \(message.body)")
    }

    private func logNavigationError(_ error: Error, phase: String) {
        let nsError = error as NSError
        let failingURL = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        let failingURLString = failingURL?.absoluteString
            ?? nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String
            ?? webView.url?.absoluteString
            ?? Config.webAppURL

        print("Web app \(phase) failed: domain=\(nsError.domain), code=\(nsError.code), url=\(failingURLString), message=\(nsError.localizedDescription)")

        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCannotConnectToHost {
            print("Connection refused. Check that the server is running, bound to 0.0.0.0, reachable from this device, and not blocked by the firewall.")
        }
    }

    private static func consoleBridgeScript() -> WKUserScript {
        let source = """
        (function() {
          if (window.__iosConsoleBridgeInstalled) return;
          window.__iosConsoleBridgeInstalled = true;

          function send(level, args) {
            try {
              var text = Array.prototype.slice.call(args).map(function(item) {
                if (typeof item === 'string') return item;
                try { return JSON.stringify(item); } catch (_) { return String(item); }
              }).join(' ');
              window.webkit.messageHandlers.iosLogger.postMessage(level + ': ' + text);
            } catch (_) {}
          }

          ['log', 'warn', 'error'].forEach(function(level) {
            var original = console[level];
            console[level] = function() {
              send(level, arguments);
              if (original) original.apply(console, arguments);
            };
          });
        })();
        """

        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    }
}
