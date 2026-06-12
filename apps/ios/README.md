# WebRtcPhone iOS MVP

This folder contains the minimal Swift code for an iOS `WKWebView` wrapper.

## Xcode Setup

1. Create a new iOS App project in Xcode.
2. Choose Swift and UIKit.
3. Replace the generated `ViewController.swift` with `WebRtcPhoneIOS/ViewController.swift`.
4. Copy the keys from `WebRtcPhoneIOS/Info.plist` into the app target's `Info.plist`.
5. In `ViewController.swift`, replace:

   ```swift
   static let webAppURL = "http://192.168.X.X:8080/index.html"
   ```

   with your PC's LAN address, for example:

   ```swift
   static let webAppURL = "http://192.168.1.20:8080/index.html"
   ```

## Local Web Server

On the PC:

```powershell
cd C:\project\webrtc
python -m http.server 8080
```

The iPhone and PC must be on the same Wi-Fi network.

## Notes

- This MVP only supports foreground use.
- It does not implement PushKit, CallKit, or lock-screen wake.
- For production, serve the web app over HTTPS and remove broad ATS exceptions.
