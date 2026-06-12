# Workload

## Web

- Reworked the Vanilla JS WebRTC SIP softphone UI.
- Added state-driven view routing.
- Restored developer mode with `?dev=1`.
- Added call history with localStorage persistence.
- Exposed Web bridge APIs for Android:
  - `window.WebRtcPhoneApp.showIncomingCall(payload)`
  - `window.WebRtcPhoneApp.answerIncomingCall()`
  - `window.WebRtcPhoneApp.rejectIncomingCall()`
  - compatible aliases: `window.showIncomingCall`, `window.answerIncomingCall`, `window.rejectIncomingCall`

## Android Step 1: WebView

- Added Java `MainActivity`.
- Enabled JavaScript, DOM storage, and WebRTC-friendly autoplay.
- Implemented `WebChromeClient.onPermissionRequest`.
- Granted only `PermissionRequest.RESOURCE_AUDIO_CAPTURE`.
- Added Android runtime `RECORD_AUDIO` permission handling.

## Android Step 2: Manifest

- Added `AndroidManifest.xml`.
- Added permissions for internet, network state, microphone, notifications, audio settings, and full-screen incoming-call notification.
- Added `MainActivity` launcher declaration.
- Added base no-action-bar theme.

## Android Step 3: FCM

- Added `IncomingCallMessagingService`.
- Handled FCM data messages:
  - `type=incoming_call`
  - `type=incoming_call_bootstrap`
- Added high-priority incoming-call notification.
- Added notification actions:
  - open app
  - answer
  - reject
- Routed notification actions back to `MainActivity` with call extras.

## Android Step 4: Native-to-Web Bridge

- Added `MainActivity.onNewIntent` handling.
- Added pending JavaScript queue for calls received before WebView page load finishes.
- Added `evaluateJavascript` calls into the Web app.
- Added `JavascriptInterface` named `AndroidPhone`.
- Added `AndroidPhone.notifyReady()` for Web-to-native readiness signaling.

## Android Project Skeleton

- Added Gradle Kotlin DSL project files.
- Added Android application module config.
- Added Firebase Messaging dependency.
- Added Google Services plugin.
- Added Android wrapper README with local setup notes.
- Converted Android source files from Kotlin to Java.

## Explicitly Not Implemented

- No `ConnectionService`.
- No `TelecomManager`.
- No deep-sleep wake strategy.
- No complex MVVM, Dagger, or extra UI framework.
