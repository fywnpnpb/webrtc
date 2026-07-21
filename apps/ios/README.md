# WebRtcPhone iOS MVP

This folder contains a minimal Xcode project for an iOS `WKWebView` wrapper.

## Xcode Setup

1. Open `WebRtcPhoneIOS.xcodeproj` in Xcode.
2. Select the `WebRtcPhoneIOS` target and set your Team for signing.
3. In `ViewController.swift`, replace:

   ```swift
   static let webAppURL = "http://192.168.X.X:8080/index.html"
   ```

   with your Mac or PC LAN address, for example:

   ```swift
   static let webAppURL = "http://192.168.1.20:8080/index.html"
   ```

## Local Web Server

On the Mac:

```sh
cd /path/to/webrtc
python -m http.server 8080 --bind 0.0.0.0
```

The iOS simulator or device must be able to reach that address.

Open the URL from Mobile Safari first:

```text
http://<Mac LAN IP>:8080/index.html
```

If Safari cannot open it, the app cannot open it either. Check that the server is still running, macOS firewall allows incoming connections, and the iPhone is not on a guest/client-isolated Wi-Fi network.

## SIP WebSocket Connectivity

The WebSocket URL entered in the app must also be reachable from the iPhone. Do not use `localhost` or `127.0.0.1` for a real device; those point to the iPhone itself, not the Mac.

Use a LAN-reachable address or domain, for example:

```text
ws://192.168.1.20:5066
wss://sip.example.com/ws
```

`NSURLErrorDomain code -1004` means the target host/port refused the connection or is not reachable. For local development, make sure the SIP/WebSocket service listens on `0.0.0.0`, not only `127.0.0.1`.

## PushKit / CallKit

- Enable the `Push Notifications` capability for the target.
- Enable `Background Modes` with `Voice over IP` and `Audio`.
- Upload the APNs VoIP token printed as `VoIP push token` to the call server.
- Send incoming calls as APNs VoIP pushes (`apns-push-type: voip`), not Firebase data messages.
- Include `call_id`, `from_uri`, and `control_ws_url` in the VoIP push payload.
- The control WebSocket accepts `stop_ringing`, `incoming_call_ended`, `call_answered`, and `cancel_incoming_call`.

## Notes

- The web app notifies Swift when a call starts and ends through `iosNativeAudio`.
- The native wrapper re-applies `AVAudioSession` call routing at call time, not only at app launch.
- PushKit and CallKit provide lock-screen incoming calls.
- For production, serve the web app over HTTPS and remove broad ATS exceptions.
