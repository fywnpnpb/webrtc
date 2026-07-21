import AVFoundation
import Contacts
import MessageUI
import Network
import UIKit
import UserNotifications
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, MFMailComposeViewControllerDelegate {
    private var webView: WKWebView!
    private var speakerphoneEnabled = false
    private var webAppReady = false
    private var pendingJavaScript: [String] = []
    private let pathMonitor = NWPathMonitor()
    private let pathMonitorQueue = DispatchQueue(label: "WebRtcPhone.NetworkPath")

    override func viewDidLoad() {
        super.viewDidLoad()

        AppLogger.info("ViewController loaded")
        view.backgroundColor = .systemBackground
        prepareAudioForCurrentDevice()
        setupWebView()
        installIncomingCallObservers()
        startNetworkMonitoring()
        restorePendingIncomingCall()
        loadWebApp()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        pathMonitor.cancel()
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosLogger")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeAudio")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeCall")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeSupport")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "iosNativeContacts")
        AppLogger.info("ViewController deinitialized")
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
        configuration.userContentController.add(self, name: "iosNativeAudio")
        configuration.userContentController.add(self, name: "iosNativeCall")
        configuration.userContentController.add(self, name: "iosNativeSupport")
        configuration.userContentController.add(self, name: "iosNativeContacts")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsBackForwardNavigationGestures = false

        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func loadWebApp() {
        guard
            let indexURL = Bundle.main.url(forResource: "index", withExtension: "html"),
            let resourceURL = Bundle.main.resourceURL
        else {
            AppLogger.error("Bundled Web app resources were not found.")
            return
        }

        let url = urlWithDevMode(indexURL)
        AppLogger.info("Loading bundled Web app URL: \(url.absoluteString)")
        webView.loadFileURL(url, allowingReadAccessTo: resourceURL)
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
        AppLogger.warn("Skipping native audio session setup on Simulator. Use a real iPhone for microphone call testing.")
        #else
        prepareCallAudioSession()
        requestMicrophonePermission()
        #endif
    }

    private func prepareCallAudioSession() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetoothHFP])
            try session.setActive(true, options: [])
            try applyAudioRoute()
            AppLogger.info("iOS call audio session prepared, speaker=\(speakerphoneEnabled)")
        } catch {
            AppLogger.error("Audio session setup failed", error: error)
        }
    }

    private func applyAudioRoute() throws {
        try AVAudioSession.sharedInstance().overrideOutputAudioPort(speakerphoneEnabled ? .speaker : .none)
    }

    private func setSpeakerphoneEnabled(_ enabled: Bool) {
        do {
            speakerphoneEnabled = enabled
            try applyAudioRoute()
            AppLogger.info("iOS speaker route changed: \(enabled)")
        } catch {
            AppLogger.error("Audio route change failed", error: error)
        }
    }

    private func clearCallAudioSession() {
        do {
            speakerphoneEnabled = false
            try applyAudioRoute()
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
            AppLogger.info("iOS call audio session cleared")
        } catch {
            AppLogger.error("Audio session cleanup failed", error: error)
        }
    }

    private func requestMicrophonePermission() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            AppLogger.info("Microphone permission granted: \(granted)")
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case "iosNativeAudio":
            handleNativeAudioMessage(message)
        case "iosNativeCall":
            handleNativeCallMessage(message)
        case "iosNativeSupport":
            handleNativeSupportMessage(message)
        case "iosNativeContacts":
            handleNativeContactsMessage(message)
        case "iosLogger":
            handleWebConsoleMessage(message.body)
        default:
            break
        }
    }

    private func handleNativeContactsMessage(_ message: WKScriptMessage) {
        guard
            let body = message.body as? [String: Any],
            body["action"] as? String == "lookup",
            let requestId = body["requestId"] as? String,
            let phone = body["phone"] as? String
        else {
            return
        }

        let store = CNContactStore()
        store.requestAccess(for: .contacts) { [weak self] granted, error in
            var contactName = ""
            if granted {
                let keys = [CNContactFormatter.descriptorForRequiredKeys(for: .fullName)]
                let predicate = CNContact.predicateForContacts(
                    matching: CNPhoneNumber(stringValue: phone)
                )
                if let contacts = try? store.unifiedContacts(
                    matching: predicate,
                    keysToFetch: keys
                ), let contact = contacts.first {
                    contactName = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
                }
            } else if let error {
                AppLogger.warn("Contacts permission or lookup failed: \(error.localizedDescription)")
            }

            let script = "window.WebRTCPhone && window.WebRTCPhone.completeContactLookup(\(Self.jsonString(requestId)), \(Self.jsonString(contactName)));"
            DispatchQueue.main.async {
                self?.webView.evaluateJavaScript(script)
            }
        }
    }

    private static func jsonString(_ value: String) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: [value]),
            let json = String(data: data, encoding: .utf8)
        else {
            return "\"\""
        }
        return String(json.dropFirst().dropLast())
    }

    private func handleWebConsoleMessage(_ body: Any) {
        let text = String(describing: body)
        if text.hasPrefix("error: ") {
            AppLogger.error("[JS] \(String(text.dropFirst(7)))")
        } else if text.hasPrefix("warn: ") {
            AppLogger.warn("[JS] \(String(text.dropFirst(6)))")
        } else if text.hasPrefix("log: ") {
            AppLogger.info("[JS] \(String(text.dropFirst(5)))")
        } else {
            AppLogger.info("[JS] \(text)")
        }
    }

    private func handleNativeCallMessage(_ message: WKScriptMessage) {
        let action = (message.body as? [String: Any])?["action"] as? String
        AppLogger.info("Native call message received: action=\(action ?? "")")
        if action == "stopIncomingCallControl" {
            (UIApplication.shared.delegate as? AppDelegate)?.stopIncomingCallControl()
        } else if action == "finishIncomingCall" {
            (UIApplication.shared.delegate as? AppDelegate)?.finishIncomingCall()
        } else if action == "inviteReady" {
            let payload = message.body as? [String: Any]
            (UIApplication.shared.delegate as? AppDelegate)?.notifyInviteReady(
                callId: payload?["callId"] as? String ?? "",
                caller: payload?["caller"] as? String ?? "",
                sipURI: payload?["sipUri"] as? String ?? "",
                receivedAt: payload?["receivedAt"] as? String ?? ""
            )
        } else if action == "inviteAccepted" {
            let payload = message.body as? [String: Any]
            (UIApplication.shared.delegate as? AppDelegate)?.confirmPushInviteAccepted(
                callId: payload?["callId"] as? String ?? ""
            )
        }
    }

    private func handleNativeSupportMessage(_ message: WKScriptMessage) {
        let payload = message.body as? [String: Any]
        let action = payload?["action"] as? String ?? ""
        AppLogger.info("Native support message received: action=\(action)")

        switch action {
        case "refreshSupportInfo":
            publishSupportInfoIfReady()
            publishLogSnapshotIfReady()
        case "openSettings":
            openSupportTarget(payload?["target"] as? String ?? "")
        case "shareText":
            let subject = payload?["subject"] as? String ?? ""
            let text = payload?["text"] as? String ?? ""
            presentShareSheet(subject: subject, text: text)
        case "emailLog":
            let recipient = payload?["recipient"] as? String ?? ""
            let subject = payload?["subject"] as? String ?? ""
            let text = payload?["text"] as? String ?? ""
            presentLogEmail(recipient: recipient, subject: subject, text: text)
        case "sendLog":
            let reason = payload?["reason"] as? String ?? "manual_log"
            let text = payload?["text"] as? String ?? ""
            _ = AppLogger.requestUpload(reason: reason, additionalContext: text)
        default:
            break
        }
    }

    private func installIncomingCallObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleIncomingCallNotification(_:)),
            name: AppDelegate.incomingCallNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAnswerCallNotification(_:)),
            name: AppDelegate.answerCallNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleCancelCallNotification(_:)),
            name: AppDelegate.cancelCallNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleApplicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    private func restorePendingIncomingCall() {
        guard
            let pending = (UIApplication.shared.delegate as? AppDelegate)?
                .consumePendingIncomingCall()
        else {
            return
        }

        AppLogger.info("Restoring pending incoming call: callId=\(pending.callId), shouldAnswer=\(pending.shouldAnswer)")
        if pending.shouldAnswer {
            evaluateWhenReady(
                pushAnswerIntentScript(
                    callId: pending.callId,
                    fromURI: pending.fromURI,
                    caller: pending.caller,
                    sipURI: pending.sipURI,
                    receivedAt: pending.receivedAt
                )
            )
        }
    }

    @objc
    private func handleIncomingCallNotification(_ notification: Notification) {
        let callId = notification.userInfo?["callId"] as? String ?? ""
        let fromURI = notification.userInfo?["fromURI"] as? String ?? "unknown"
        AppLogger.info("Incoming call notification observed: callId=\(callId), fromURI=\(fromURI)")
    }

    @objc
    private func handleAnswerCallNotification(_ notification: Notification) {
        let callId = notification.userInfo?["callId"] as? String ?? ""
        let fromURI = notification.userInfo?["fromURI"] as? String ?? "unknown"
        let caller = notification.userInfo?["caller"] as? String ?? fromURI
        let sipURI = notification.userInfo?["sipURI"] as? String ?? ""
        let receivedAt = notification.userInfo?["receivedAt"] as? String ?? ""
        AppLogger.info("Answer call notification observed: callId=\(callId)")
        evaluateWhenReady(
            pushAnswerIntentScript(
                callId: callId,
                fromURI: fromURI,
                caller: caller,
                sipURI: sipURI,
                receivedAt: receivedAt
            )
        )
    }

    @objc
    private func handleCancelCallNotification(_ notification: Notification) {
        let reason = notification.userInfo?["reason"] as? String ?? "server_stop"
        AppLogger.info("Cancel call notification observed: reason=\(reason)")
        evaluateWhenReady(
            "window.WebRTCPhone && window.WebRTCPhone.cancelPushAnswer(\(jsonString(reason)));"
        )
    }

    @objc
    private func handleApplicationDidBecomeActive() {
        AppLogger.info("Application became active")
        publishSupportInfoIfReady()
        publishLogSnapshotIfReady()
    }

    private func showIncomingCallScript(callId: String, fromURI: String) -> String {
        let payload: [String: String] = ["callId": callId, "fromUri": fromURI]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            return ""
        }
        return "window.WebRTCPhone && window.WebRTCPhone.incomingCall(\(json));"
    }

    private func pushAnswerIntentScript(
        callId: String,
        fromURI: String,
        caller: String,
        sipURI: String,
        receivedAt: String
    ) -> String {
        let payload: [String: Any] = [
            "callId": callId,
            "fromUri": fromURI,
            "caller": caller,
            "sipUri": sipURI,
            "receivedAt": receivedAt,
            "autoAnswerAfterRegister": true
        ]
        guard
            let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            return ""
        }
        return "window.WebRTCPhone && window.WebRTCPhone.handlePushAnswerIntent(\(json));"
    }

    private func evaluateWhenReady(_ script: String) {
        guard !script.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if self.webAppReady {
                self.webView.evaluateJavaScript(script)
            } else {
                self.pendingJavaScript.append(script)
            }
        }
    }

    private func flushPendingJavaScript() {
        let scripts = pendingJavaScript
        pendingJavaScript.removeAll()
        scripts.forEach { webView.evaluateJavaScript($0) }
    }

    private func jsonString(_ value: String) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: [value]),
            let array = String(data: data, encoding: .utf8),
            array.count >= 2
        else {
            return "\"\""
        }
        return String(array.dropFirst().dropLast())
    }

    private func publishSupportInfoIfReady() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            guard let self else { return }

            let authorizationStatus: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                authorizationStatus = "granted"
            case .denied:
                authorizationStatus = "denied"
            case .notDetermined:
                authorizationStatus = "prompt"
            @unknown default:
                authorizationStatus = "unknown"
            }

            let microphoneStatus: String
            switch AVAudioSession.sharedInstance().recordPermission {
            case .granted:
                microphoneStatus = "granted"
            case .denied:
                microphoneStatus = "denied"
            case .undetermined:
                microphoneStatus = "prompt"
            @unknown default:
                microphoneStatus = "unknown"
            }

            let device = UIDevice.current
            let info: [String: Any] = [
                "platform": "ios",
                "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
                "appBuild": Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "",
                "osVersion": device.systemVersion,
                "manufacturer": "Apple",
                "model": device.model,
                "deviceName": device.name,
                "notificationPermission": authorizationStatus,
                "microphonePermission": microphoneStatus,
                "lowPowerModeEnabled": ProcessInfo.processInfo.isLowPowerModeEnabled
            ]

            guard
                let data = try? JSONSerialization.data(withJSONObject: info),
                let json = String(data: data, encoding: .utf8)
            else {
                AppLogger.warn("Failed to serialize native support info")
                return
            }

            self.evaluateWhenReady(
                "window.__nativeSupportInfo=\(json);window.dispatchEvent(new Event('native-support-updated'));"
            )
        }
    }

    private func publishLogSnapshotIfReady() {
        let mailLog = jsonString(AppLogger.mailLogTail())
        let longLog = jsonString(AppLogger.longLogTail())
        let canSendLog = AppLogger.canUpload ? "true" : "false"
        evaluateWhenReady(
            "window.__nativeMailLog=\(mailLog);window.__nativeLongLog=\(longLog);window.__nativeCanSendLog=\(canSendLog);"
        )
    }

    private func openSupportTarget(_ target: String) {
        if target == "request-notifications" {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { [weak self] _, error in
                if let error {
                    AppLogger.warn("Notification authorization request failed", error: error)
                } else {
                    AppLogger.info("Notification authorization requested")
                }
                self?.publishSupportInfoIfReady()
            }
            return
        }

        DispatchQueue.main.async {
            let url: URL?
            switch target {
            case "notifications":
                if #available(iOS 16.0, *) {
                    url = URL(string: UIApplication.openNotificationSettingsURLString)
                } else {
                    url = URL(string: UIApplication.openSettingsURLString)
                }
            case "app-settings", "permissions":
                url = URL(string: UIApplication.openSettingsURLString)
            default:
                url = URL(string: UIApplication.openSettingsURLString)
            }

            guard let url else { return }
            AppLogger.info("Opening support target: \(target)")
            UIApplication.shared.open(url)
        }
    }

    private func presentShareSheet(subject: String, text: String) {
        AppLogger.info("Presenting share sheet: subject=\(subject), length=\(text.count)")
        DispatchQueue.main.async { [weak self] in
            let activityController = UIActivityViewController(
                activityItems: [subject, text],
                applicationActivities: nil
            )
            if let popover = activityController.popoverPresentationController {
                popover.sourceView = self?.view
                popover.sourceRect = CGRect(
                    x: self?.view.bounds.midX ?? 0,
                    y: self?.view.bounds.midY ?? 0,
                    width: 1,
                    height: 1
                )
            }
            self?.present(activityController, animated: true)
        }
    }

    private func presentLogEmail(recipient: String, subject: String, text: String) {
        AppLogger.info("Presenting diagnostic email: recipient=\(recipient), length=\(text.count)")
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard MFMailComposeViewController.canSendMail() else {
                AppLogger.warn("Mail is not configured; opening share sheet")
                self.presentShareSheet(subject: subject, text: text)
                return
            }

            let composer = MFMailComposeViewController()
            composer.mailComposeDelegate = self
            composer.setToRecipients([recipient])
            composer.setSubject(subject)
            composer.setMessageBody(text, isHTML: false)
            self.present(composer, animated: true)
        }
    }

    func mailComposeController(
        _ controller: MFMailComposeViewController,
        didFinishWith result: MFMailComposeResult,
        error: Error?
    ) {
        if let error {
            AppLogger.warn("Diagnostic email composer failed", error: error)
        } else {
            AppLogger.info("Diagnostic email composer finished: result=\(result.rawValue)")
        }
        controller.dismiss(animated: true)
    }

    private func startNetworkMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let networkType: String
            if path.usesInterfaceType(.wifi) {
                networkType = "wifi"
            } else if path.usesInterfaceType(.cellular) {
                networkType = "cellular"
            } else if path.usesInterfaceType(.wiredEthernet) {
                networkType = "ethernet"
            } else {
                networkType = "other"
            }

            let info: [String: Any] = [
                "networkType": networkType,
                "online": path.status == .satisfied,
                "isExpensive": path.isExpensive,
                "isConstrained": path.isConstrained
            ]
            guard
                let data = try? JSONSerialization.data(withJSONObject: info),
                let json = String(data: data, encoding: .utf8)
            else {
                AppLogger.warn("Failed to serialize native network info")
                return
            }
            AppLogger.info("Native network state changed: \(json)")
            self?.evaluateWhenReady(
                "window.__nativeNetworkInfo=\(json);window.dispatchEvent(new Event('native-network-change'));"
            )
        }
        pathMonitor.start(queue: pathMonitorQueue)
        AppLogger.info("Network monitoring started")
    }

    private func handleNativeAudioMessage(_ message: WKScriptMessage) {
        let action = (message.body as? [String: Any])?["action"] as? String
        AppLogger.info("Native audio message received: action=\(action ?? "")")

        DispatchQueue.main.async { [weak self] in
            if action == "start" {
                let speaker = (message.body as? [String: Any])?["speaker"] as? Bool ?? false
                self?.speakerphoneEnabled = speaker
                self?.prepareCallAudioSession()
            } else if action == "route" {
                let speaker = (message.body as? [String: Any])?["speaker"] as? Bool ?? false
                self?.setSpeakerphoneEnabled(speaker)
            } else if action == "stop" {
                self?.clearCallAudioSession()
                (UIApplication.shared.delegate as? AppDelegate)?.finishIncomingCall()
            }
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
            AppLogger.info("WKWebView media capture permission granted")
            decisionHandler(.grant)
        } else {
            decisionHandler(.prompt)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webAppReady = true
        flushPendingJavaScript()
        publishSupportInfoIfReady()
        publishLogSnapshotIfReady()
        AppLogger.info("Web app loaded: \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logNavigationError(error, phase: "navigation")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logNavigationError(error, phase: "provisional navigation")
    }

    private func logNavigationError(_ error: Error, phase: String) {
        let nsError = error as NSError
        let failingURL = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        let failingURLString = failingURL?.absoluteString
            ?? nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String
            ?? webView.url?.absoluteString
            ?? "bundled index.html"

        AppLogger.error(
            "Web app \(phase) failed: domain=\(nsError.domain), code=\(nsError.code), url=\(failingURLString), message=\(nsError.localizedDescription)",
            error: error
        )

        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCannotConnectToHost {
            AppLogger.warn("Connection refused. Check that the server is running, reachable from this device, and not blocked by the firewall.")
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
