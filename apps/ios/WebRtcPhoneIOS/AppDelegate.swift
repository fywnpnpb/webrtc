import CallKit
import PushKit
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, PKPushRegistryDelegate, CXProviderDelegate {
    static let incomingCallNotification = Notification.Name("WebRtcPhoneIncomingCall")
    static let answerCallNotification = Notification.Name("WebRtcPhoneAnswerCall")
    static let cancelCallNotification = Notification.Name("WebRtcPhoneCancelCall")

    private let callController = CXCallController()
    private lazy var callProvider: CXProvider = {
        let configuration = CXProviderConfiguration(localizedName: "WebRTC SIP Phone")
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.includesCallsInRecents = false
        let provider = CXProvider(configuration: configuration)
        provider.setDelegate(self, queue: .main)
        return provider
    }()

    private var pushRegistry: PKPushRegistry?
    private var controlWebSocket: URLSessionWebSocketTask?
    private var activeCallUUID: UUID?
    private var activeCallId = ""
    private var activeFromURI = ""
    private var activeCaller = ""
    private var activeSIPURI = ""
    private var activeReceivedAt = ""
    private var pendingAnswer = false
    private var pendingPushAnswer = false
    private var inviteWaitTimer: DispatchWorkItem?

    private static let inviteWaitTimeout: TimeInterval = 60

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        AppLogger.configure()
        AppLogger.info("Application started")
        _ = callController
        _ = callProvider

        let registry = PKPushRegistry(queue: .main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry
        AppLogger.info("PushKit registry configured")
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        AppLogger.info("Scene connection requested")
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didUpdate pushCredentials: PKPushCredentials,
        for type: PKPushType
    ) {
        let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "voipPushToken")
        AppLogger.info("VoIP push token updated")
        AppLogger.debug("VoIP push token value: \(token)")
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didInvalidatePushTokenFor type: PKPushType
    ) {
        UserDefaults.standard.removeObject(forKey: "voipPushToken")
        AppLogger.warn("VoIP push token invalidated")
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let values = payload.dictionaryPayload
        AppLogger.info("VoIP PUSH received: payload=\(values)")

        let callId = firstString(values, keys: ["call_id", "callId"])
            ?? UUID().uuidString
        let fromURI = firstString(values, keys: ["from_uri", "fromUri", "from"])
            ?? "unknown"
        let caller = firstString(values, keys: ["caller", "caller_name", "from", "from_uri", "fromUri"])
            ?? fromURI
        let sipURI = firstString(values, keys: ["sip_uri", "sipUri", "to_uri"])
            ?? ""
        let receivedAt = firstString(values, keys: ["received_at", "receivedAt"])
            ?? String(Int(Date().timeIntervalSince1970 * 1000))
        let controlURL = firstString(
            values,
            keys: ["control_ws_url", "websocket_url", "ws_url"]
        )
        let controlToken = firstString(
            values,
            keys: ["control_ws_token", "control_token"]
        )
        let deviceId = firstString(values, keys: ["device_id", "deviceId"])

        activeCallId = callId
        activeFromURI = fromURI
        activeCaller = caller
        activeSIPURI = sipURI
        activeReceivedAt = receivedAt
        pendingAnswer = false
        pendingPushAnswer = false
        cancelInviteWaitTimer()
        let uuid = UUID()
        activeCallUUID = uuid
        AppLogger.info("Incoming call PUSH parsed: callId=\(callId), fromURI=\(fromURI)")

        if let controlURL {
            connectControlWebSocket(
                urlString: controlURL,
                token: controlToken,
                callId: callId,
                deviceId: deviceId
            )
        } else {
            AppLogger.warn("Incoming call PUSH has no control WebSocket URL")
        }

        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: fromURI)
        update.localizedCallerName = fromURI
        update.hasVideo = false

        callProvider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                AppLogger.error("CallKit incoming call failed", error: error)
                self?.stopControlWebSocket()
            } else {
                AppLogger.info("CallKit incoming call reported: callId=\(callId)")
                NotificationCenter.default.post(
                    name: Self.incomingCallNotification,
                    object: nil,
                    userInfo: ["callId": callId, "fromURI": fromURI]
                )
            }
            completion()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        AppLogger.info("Call answer requested: callId=\(activeCallId)")
        guard !activeCallId.isEmpty else {
            AppLogger.warn("Call answer requested without an active VoIP push call")
            action.fail()
            return
        }

        pendingAnswer = true
        pendingPushAnswer = true
        scheduleInviteWaitTimeout()
        NotificationCenter.default.post(
            name: Self.answerCallNotification,
            object: nil,
            userInfo: pushAnswerUserInfo()
        )
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        AppLogger.info("Call end requested: callId=\(activeCallId)")
        stopControlWebSocket()
        NotificationCenter.default.post(
            name: Self.cancelCallNotification,
            object: nil,
            userInfo: ["callId": activeCallId, "reason": "user_ended"]
        )
        clearActiveCall()
        action.fulfill()
    }

    func providerDidReset(_ provider: CXProvider) {
        AppLogger.warn("Call provider reset")
        stopControlWebSocket()
        clearActiveCall()
    }

    func finishIncomingCall() {
        AppLogger.info("Finishing incoming call: callId=\(activeCallId)")
        stopControlWebSocket()
        guard let uuid = activeCallUUID else {
            clearActiveCall()
            return
        }

        callProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        clearActiveCall()
    }

    func stopIncomingCallControl() {
        AppLogger.info("Stopping incoming call control")
        stopControlWebSocket()
    }

    func consumePendingIncomingCall() -> (
        callId: String,
        fromURI: String,
        caller: String,
        sipURI: String,
        receivedAt: String,
        shouldAnswer: Bool
    )? {
        guard !activeCallId.isEmpty else { return nil }
        let result: (
            callId: String,
            fromURI: String,
            caller: String,
            sipURI: String,
            receivedAt: String,
            shouldAnswer: Bool
        ) = (
            activeCallId,
            activeFromURI,
            activeCaller,
            activeSIPURI,
            activeReceivedAt,
            pendingAnswer
        )
        pendingAnswer = false
        AppLogger.info("Consuming pending incoming call: callId=\(result.callId), shouldAnswer=\(result.shouldAnswer)")
        return result
    }

    func notifyInviteReady(callId: String, caller: String, sipURI: String, receivedAt: String) {
        guard pendingPushAnswer, callId == activeCallId else {
            AppLogger.warn("INVITE ready notification ignored: callId=\(callId)")
            return
        }
        guard let controlWebSocket else {
            AppLogger.warn("INVITE ready notification skipped because call control is not active: callId=\(callId)")
            return
        }

        let message: [String: String] = [
            "type": "invite_ready",
            "call_id": callId,
            "caller": caller,
            "sip_uri": sipURI,
            "received_at": receivedAt
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: message),
              let text = String(data: data, encoding: .utf8) else {
            AppLogger.warn("Failed to serialize INVITE ready notification")
            return
        }

        controlWebSocket.send(.string(text)) { error in
            if let error {
                AppLogger.warn("INVITE ready notification failed", error: error)
            } else {
                AppLogger.info("INVITE ready notification sent: callId=\(callId)")
            }
        }
    }

    func confirmPushInviteAccepted(callId: String) {
        guard pendingPushAnswer, callId == activeCallId else { return }
        pendingPushAnswer = false
        cancelInviteWaitTimer()
        AppLogger.info("PUSH answer INVITE accepted: callId=\(callId)")
    }

    private func connectControlWebSocket(
        urlString: String,
        token: String?,
        callId: String,
        deviceId: String?
    ) {
        stopControlWebSocket()
        guard let url = URL(string: urlString) else {
            AppLogger.warn("Invalid incoming call control WebSocket URL: \(urlString)")
            return
        }

        var request = URLRequest(url: url)
        if let token, !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let task = URLSession.shared.webSocketTask(with: request)
        controlWebSocket = task
        task.resume()
        AppLogger.info("Call control WebSocket connected: callId=\(callId), url=\(urlString)")

        var subscription: [String: Any] = [
            "type": "subscribe_incoming_call",
            "call_id": callId
        ]
        if let deviceId, !deviceId.isEmpty {
            subscription["device_id"] = deviceId
        }

        if let data = try? JSONSerialization.data(withJSONObject: subscription),
           let text = String(data: data, encoding: .utf8) {
            task.send(.string(text)) { error in
                if let error {
                    AppLogger.warn("Call control subscription failed", error: error)
                } else {
                    AppLogger.info("Call control subscription sent: callId=\(callId)")
                }
            }
        }
        receiveControlMessage(task)
    }

    private func receiveControlMessage(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self, weak task] result in
            guard
                let self,
                let task,
                let currentTask = self.controlWebSocket,
                task === currentTask
            else {
                return
            }

            switch result {
            case .failure(let error):
                AppLogger.warn("Call control WebSocket failed", error: error)
            case .success(let message):
                let text: String
                switch message {
                case .string(let value):
                    text = value
                case .data(let data):
                    text = String(data: data, encoding: .utf8) ?? ""
                @unknown default:
                    text = ""
                }

                AppLogger.info("Call control WebSocket message: \(text)")
                if self.shouldStopIncomingCall(messageText: text) {
                    DispatchQueue.main.async {
                        AppLogger.info("Incoming call stopped by control WebSocket: callId=\(self.activeCallId)")
                        NotificationCenter.default.post(
                            name: Self.cancelCallNotification,
                            object: nil,
                            userInfo: [
                                "callId": self.activeCallId,
                                "reason": "server_stop"
                            ]
                        )
                        self.finishIncomingCall()
                    }
                    return
                }
                self.receiveControlMessage(task)
            }
        }
    }

    private func shouldStopIncomingCall(messageText: String) -> Bool {
        guard let data = messageText.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data),
              let object = json as? [String: Any] else {
            AppLogger.warn("Invalid call control WebSocket message: \(messageText)")
            return false
        }

        let type = firstString(object, keys: ["type", "event_type", "action"]) ?? ""
        let stopTypes = Set([
            "stop_ringing",
            "incoming_call_ended",
            "call_answered",
            "cancel_incoming_call"
        ])
        guard stopTypes.contains(type) else {
            AppLogger.debug("Call control command ignored: type=\(type)")
            return false
        }

        let callId = firstString(object, keys: ["call_id", "callId"])
        let matches = callId == nil || callId == activeCallId
        if !matches {
            AppLogger.debug("Call control command ignored for another call: callId=\(callId ?? "")")
        }
        return matches
    }

    private func stopControlWebSocket() {
        if controlWebSocket != nil {
            AppLogger.info("Call control WebSocket disconnected: callId=\(activeCallId)")
        }
        controlWebSocket?.cancel(with: .normalClosure, reason: nil)
        controlWebSocket = nil
    }

    private func clearActiveCall() {
        AppLogger.info("Clearing active call state: callId=\(activeCallId)")
        cancelInviteWaitTimer()
        activeCallUUID = nil
        activeCallId = ""
        activeFromURI = ""
        activeCaller = ""
        activeSIPURI = ""
        activeReceivedAt = ""
        pendingAnswer = false
        pendingPushAnswer = false
    }

    private func pushAnswerUserInfo() -> [String: Any] {
        [
            "callId": activeCallId,
            "fromURI": activeFromURI,
            "caller": activeCaller,
            "sipURI": activeSIPURI,
            "receivedAt": activeReceivedAt,
            "autoAnswerAfterRegister": true
        ]
    }

    private func scheduleInviteWaitTimeout() {
        cancelInviteWaitTimer()
        let timer = DispatchWorkItem { [weak self] in
            guard let self, self.pendingPushAnswer else { return }
            let callId = self.activeCallId
            AppLogger.warn("PUSH answer INVITE timeout: callId=\(callId)")
            NotificationCenter.default.post(
                name: Self.cancelCallNotification,
                object: nil,
                userInfo: ["callId": callId, "reason": "invite_timeout"]
            )
            self.finishIncomingCall()
        }
        inviteWaitTimer = timer
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.inviteWaitTimeout, execute: timer)
    }

    private func cancelInviteWaitTimer() {
        inviteWaitTimer?.cancel()
        inviteWaitTimer = nil
    }

    private func firstString(_ values: [AnyHashable: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = values[key] as? String, !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private func firstString(_ values: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = values[key] as? String, !value.isEmpty {
                return value
            }
        }
        return nil
    }
}
