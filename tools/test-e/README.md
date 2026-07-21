# WebRTC Test E

Test E の PC 側 Test API Server、Provisioning、Runner を WebRTC リポジトリ内で管理します。
第一段階では Android App の既存 Test Agent プロトコルをそのまま使用します。

## 構成

- `config/test-e.config.json`: Server、SIP、A/B/C、外線、タイミングの共通設定
- `server/`: Android App が polling する Test API Server
- `runner/`: 21 ケースの Test E Runner と A/B smoke test
- `public/provisioning.html`: Android Deep Link Provisioning
- `public/dashboard.html`: 端末状態、命令、イベントの管理画面

端末の既定割り当て:

| Slot | Device ID | SIP user |
| --- | --- | --- |
| A | 101 | webrtc_101 |
| B | 102 | webrtc_102 |
| C | 103 | webrtc_103 |

## 初回セットアップ

```powershell
npm install
npm run start:test-api
```

起動ログに PC 用と端末用の Provisioning URL が表示されます。
別のターミナルからブラウザを自動で開く場合:

```powershell
npm run provisioning
```

`start:test-api` と `provisioning` はどちらも Server を起動するため、同時には実行しません。
すでに Server が動作している場合は、表示された `/provisioning.html` を直接開いてください。

## Provisioning

1. Android 実機から `http://<PC-LAN-IP>:3200/provisioning.html` を開く。
2. `Test Agent Server URL` が `http://<PC-LAN-IP>:3200` であることを確認する。
3. 端末ごとに A、B、C のボタンを押す。
4. WebRTC App が開き、SIP と Test Agent 設定が保存される。
5. Provisioning ページまたは `/dashboard.html` で online / registered を確認する。

Android 実機から `localhost` や `127.0.0.1` は使用できません。

## Runner

21 ケースの読込確認:

```powershell
npm run test:e:list
```

A/B 内線 smoke test:

```powershell
npm run test:e:smoke
```

Smoke test は次を実行します。

1. A/B の Test Agent と SIP 登録を確認
2. A → B、B 応答、A 切断
3. A → B、B 応答、B 切断
4. A → B、応答前に A 切断

21 ケースの Runner:

```powershell
npm run test:e
```

個別実行や旧 Runner 互換オプション:

```powershell
node tools/test-e/runner/cli.mjs --case=E-OUT-b-device-self --keep-registered
node tools/test-e/runner/cli.mjs --inbound --manual-external
node tools/test-e/runner/cli.mjs --outbound --reset-events --reset-commands
```

## 環境変数による一時上書き

公開リポジトリの `config/test-e.config.json` には例示値だけを置きます。
実際の接続先、アカウント、電話番号、特に SIP パスワードは環境変数で設定してください。

```powershell
$env:IVR_E_WEB_API_BASE="http://127.0.0.1:3200"
$env:IVR_E_SIP_WS_URL="wss://sip.example.test/webrtc/ws"
$env:IVR_E_SIP_DOMAIN="sip.example.test"
$env:IVR_E_SIP_PASSWORD="<set-locally>"
$env:IVR_E_DEVICE_A_AUTH_USER="example_101"
$env:IVR_E_DEVICE_B_AUTH_USER="example_102"
$env:IVR_E_DEVICE_C_AUTH_USER="example_103"
$env:IVR_E_INBOUND_PHONE="050..."
$env:IVR_E_OUTBOUND_PHONE="050..."
$env:IVR_E_CALLTEST_BASE="http://..."
```

## 第一段階の制限

- Test API の commands/events はメモリ保存で、Server 終了時に消えます。
- `transfer` は JsSIP の REFER 結果イベントを待って完了または失敗を判定します。
- delivery lease、scenarioRunId、legId は未実装です。
- 外線ケースは calltest サービスと実際の電話番号ルーティングに依存します。

## コマンド状態と自動テスト

コマンド状態は `queued`、`delivered`、`completed`、`failed` の4種類です。
Runner はコマンドごとの設定時間まで終端状態を待ち、失敗またはタイムアウトを Scenario の NG 理由として記録します。

```powershell
npm run test:test-e
```

Runner の実行結果は次の場所に保存されます。

```text
test-results/<run-id>/summary.json
test-results/<run-id>/commands.json
test-results/<run-id>/events.json
test-results/<run-id>/runner.log
```

イベントは `deviceId`、`event`、`timestamp`、`commandId`、`callId`、`data` を持つ統一形式で保存されます。
