# WebRtcPhoneWrapper

## 必要なローカル設定

- Firebase Console から取得した `google-services.json` を `app/google-services.json` に配置する。
- 開発中の Web アプリは `http://10.0.2.2:8080/` で配信する。
- 実機で確認する場合は `MainActivity.WEB_APP_URL` を同一ネットワーク上の PC IP に変更する。

## 実装範囲

- WebView の WebRTC マイク許可
- FCM data message 受信
- 着信 Notification
- Notification action から WebView JavaScript への bridge

## 明示的に未実装

- ConnectionService
- TelecomManager
- 端末 deep sleep からの強制起床
