import Foundation

final class AppLogger {
    private enum Level: String {
        case debug = "DEBUG"
        case info = "INFO"
        case warn = "WARN"
        case error = "ERROR"
    }

    private struct UploadTarget {
        let url: URL
        let bearerToken: String
    }

    private static let shared = AppLogger()
    private static let maxLogChars = 200_000
    private static let mailLogFileName = "log_mail.log"
    private static let longLogFileName = "log_long.log"

    private let queue = DispatchQueue(label: "WebRtcPhone.AppLogger")
    private var uploadInProgress = false
    private var uploadTarget: UploadTarget?

    private lazy var logsDirectoryURL: URL = {
        let fileManager = FileManager.default
        let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        let directoryURL = baseURL.appendingPathComponent("WebRtcPhoneLogs", isDirectory: true)
        if !fileManager.fileExists(atPath: directoryURL.path) {
            try? fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        }
        return directoryURL
    }()

    private lazy var mailLogURL: URL = logsDirectoryURL.appendingPathComponent(Self.mailLogFileName)
    private lazy var longLogURL: URL = logsDirectoryURL.appendingPathComponent(Self.longLogFileName)

    static var canUpload: Bool {
        shared.queue.sync { shared.uploadTarget != nil }
    }

    static func configure() {
        shared.configureIfNeeded()
        NSSetUncaughtExceptionHandler { exception in
            AppLogger.handle(exception: exception)
        }
    }

    static func debug(
        _ message: String,
        file: String = #fileID,
        line: Int = #line,
        function: String = #function
    ) {
        shared.log(level: .debug, message: message, error: nil, stackTrace: nil, file: file, line: line, function: function)
    }

    static func info(
        _ message: String,
        file: String = #fileID,
        line: Int = #line,
        function: String = #function
    ) {
        shared.log(level: .info, message: message, error: nil, stackTrace: nil, file: file, line: line, function: function)
    }

    static func warn(
        _ message: String,
        error: Error? = nil,
        file: String = #fileID,
        line: Int = #line,
        function: String = #function
    ) {
        shared.log(
            level: .warn,
            message: message,
            error: error,
            stackTrace: error == nil ? nil : Thread.callStackSymbols.joined(separator: "\n"),
            file: file,
            line: line,
            function: function
        )
    }

    static func error(
        _ message: String,
        error: Error? = nil,
        autoUpload: Bool = false,
        file: String = #fileID,
        line: Int = #line,
        function: String = #function
    ) {
        shared.log(
            level: .error,
            message: message,
            error: error,
            stackTrace: error == nil ? nil : Thread.callStackSymbols.joined(separator: "\n"),
            file: file,
            line: line,
            function: function
        )
        if autoUpload {
            _ = requestUpload(reason: "error", additionalContext: message)
        }
    }

    static func mailLogTail() -> String {
        shared.readTail(from: shared.mailLogURL)
    }

    static func longLogTail() -> String {
        shared.readTail(from: shared.longLogURL)
    }

    @discardableResult
    static func requestUpload(reason: String, additionalContext: String) -> Bool {
        shared.requestUploadInternal(reason: reason, additionalContext: additionalContext)
    }

    private func configureIfNeeded() {
        queue.sync {
            if uploadTarget == nil {
                uploadTarget = Self.readUploadTarget()
            }
        }
    }

    private func log(
        level: Level,
        message: String,
        error: Error?,
        stackTrace: String?,
        file: String,
        line: Int,
        function: String
    ) {
        let timestamp = Self.timestampFormatter.string(from: Date())
        let fileName = URL(fileURLWithPath: file).lastPathComponent
        let caller = "\(fileName):\(line) \(function)"
        let errorText = error.map { "\n\($0)" } ?? ""
        let stackText = (stackTrace?.isEmpty == false) ? "\n\(stackTrace!)" : ""
        let mailLine = "[\(timestamp)] [\(level.rawValue)] \(caller) - \(message)\(errorText)\(stackText)"
        let longLine = "[\(timestamp)]\nlevel=\(level.rawValue)\ncaller=\(caller)\nmessage=\(message)\(errorText)\(stackText)"
        let consoleLine = "[\(level.rawValue)] \(caller) - \(message)"

        switch level {
        case .debug:
            print(consoleLine)
        case .info:
            print(consoleLine)
        case .warn:
            print(consoleLine + errorText)
        case .error:
            print(consoleLine + errorText)
        }

        guard level != .debug else {
            return
        }

        queue.async {
            self.appendTrimmed(text: mailLine + "\n", to: self.mailLogURL)
            self.appendTrimmed(text: longLine + "\n\n", to: self.longLogURL)
        }
    }

    private func appendTrimmed(text: String, to url: URL) {
        let existing = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        var combined = existing + text
        if combined.count > Self.maxLogChars {
            combined = String(combined.suffix(Self.maxLogChars))
        }
        try? combined.write(to: url, atomically: true, encoding: .utf8)
    }

    private func readTail(from url: URL) -> String {
        queue.sync {
            let text = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
            if text.count <= Self.maxLogChars {
                return text
            }
            return String(text.suffix(Self.maxLogChars))
        }
    }

    private func requestUploadInternal(reason: String, additionalContext: String) -> Bool {
        configureIfNeeded()

        let target: UploadTarget? = queue.sync {
            guard !uploadInProgress else {
                return nil
            }
            guard let uploadTarget else {
                return nil
            }
            uploadInProgress = true
            return uploadTarget
        }

        guard let target else {
            return false
        }

        let logText = Self.mailLogTail()
        let payload: [String: Any] = [
            "reason": reason,
            "context": additionalContext,
            "log": logText,
            "bundleIdentifier": Bundle.main.bundleIdentifier ?? "",
            "generatedAt": ISO8601DateFormatter().string(from: Date())
        ]

        guard let body = try? JSONSerialization.data(withJSONObject: payload) else {
            queue.async { self.uploadInProgress = false }
            return false
        }

        var request = URLRequest(url: target.url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        if !target.bearerToken.isEmpty {
            request.setValue("Bearer \(target.bearerToken)", forHTTPHeaderField: "Authorization")
        }

        URLSession.shared.dataTask(with: request) { _, response, error in
            defer {
                self.queue.async {
                    self.uploadInProgress = false
                }
            }

            if let error {
                print("Log upload failed: \(error.localizedDescription)")
                return
            }

            if let httpResponse = response as? HTTPURLResponse,
               !(200...299).contains(httpResponse.statusCode) {
                print("Log upload failed with HTTP \(httpResponse.statusCode)")
                return
            }

            print("Log upload completed: \(reason)")
        }.resume()

        return true
    }

    private static func readUploadTarget() -> UploadTarget? {
        let info = Bundle.main.infoDictionary ?? [:]
        let urlText = (info["LOG_UPLOAD_URL"] as? String)
            ?? (info["LogUploadURL"] as? String)
            ?? ""
        let bearerToken = (info["LOG_UPLOAD_BEARER"] as? String)
            ?? (info["LogUploadBearer"] as? String)
            ?? ""

        guard let url = URL(string: urlText), !urlText.isEmpty else {
            return nil
        }

        return UploadTarget(url: url, bearerToken: bearerToken)
    }

    private static func handle(exception: NSException) {
        let stackTrace = exception.callStackSymbols.joined(separator: "\n")
        shared.log(
            level: .error,
            message: "Uncaught Objective-C exception: \(exception.name.rawValue) \(exception.reason ?? "")",
            error: nil,
            stackTrace: stackTrace,
            file: "AppLogger.swift",
            line: 0,
            function: "NSSetUncaughtExceptionHandler"
        )
        _ = requestUpload(reason: "uncaught_exception", additionalContext: exception.reason ?? exception.name.rawValue)
    }

    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return formatter
    }()
}
