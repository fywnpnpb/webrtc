# WebRTC Test E 使い方

## 1. 概要

Test E は、複数の Android 端末を PC から操作し、WebRTC/SIP 通話を自動確認するためのテストツールです。

次の 3 要素で動作します。

1. **Test API Server**: PC 上で動作し、端末へのコマンドと端末からのイベントを管理します。
2. **Test Agent**: Android 版 WebRTC App 内で動作し、Server をポーリングして登録、発信、応答、切断、転送などを実行します。
3. **Runner**: テストシナリオを順番に実行し、結果を `test-results/` に保存します。

端末の既定割り当ては次のとおりです。

| Slot | Device ID | SIP ユーザー | 主な役割 |
| --- | --- | --- | --- |
| A | `101` | `webrtc_101` | 主試験端末 |
| B | `102` | `webrtc_102` | 相手・転送先端末 |
| C | `103` | `webrtc_103` | 2 段階転送先端末 |

## 2. 事前準備

次を準備してください。

- Node.js と npm が使用できる PC
- 最新版の WebRTC App をインストールした Android 端末 3 台
- PC と Android 端末が相互通信できる同一 LAN
- SIP テスト環境へ接続できるネットワーク
- 外線シナリオを行う場合は、設定済みの電話番号と calltest サービス、または手動操作用の電話機
- Windows Firewall などで PC の TCP `3200` 番ポートへの LAN 内アクセスが許可されていること

初回だけ、リポジトリのルートで依存関係をインストールします。

```powershell
cd C:\project\webrtc
npm install
```

既定値は [`config/test-e.config.json`](config/test-e.config.json) にあります。SIP 接続先、端末 ID、電話番号などが実際のテスト環境と一致していることを確認してください。

## 3. Test API Server を起動する

PowerShell を 1 つ開き、リポジトリのルートで次を実行します。

```powershell
npm run start:test-api
```

起動すると、次の URL が表示されます。

```text
Test E API: http://127.0.0.1:3200
Dashboard: http://127.0.0.1:3200/dashboard.html
Provisioning (PC): http://127.0.0.1:3200/provisioning.html
Provisioning (device): http://<PC-LAN-IP>:3200/provisioning.html
```

Provisioning ページを PC で自動的に開きたい場合は、代わりに次を実行できます。

```powershell
npm run provisioning
```

`start:test-api` と `provisioning` は、どちらも同じ Server を起動します。同時には実行しないでください。

Server を停止する場合は、起動した PowerShell で `Ctrl+C` を押します。Server を停止すると、その時点のコマンドとイベントは消去されます。

## 4. Android 端末を Provisioning する

各 Android 端末で次の操作を行います。

1. Chrome などで、Server 起動時に表示された `http://<PC-LAN-IP>:3200/provisioning.html` を開きます。
2. ページ上部の `Test Agent Server URL` が `http://<PC-LAN-IP>:3200` になっていることを確認します。
3. 端末 A では A、端末 B では B、端末 C では C の設定ボタンを押します。
4. WebRTC App が開いたら、SIP 設定と Test Agent 設定が保存されたことを確認します。
5. 3 台すべてで WebRTC App を起動したままにします。

Android 端末から `localhost` や `127.0.0.1` を指定すると、Android 端末自身を参照するため PC へ接続できません。必ず Server 起動ログに表示された PC の LAN IP を使用してください。

## 5. Dashboard で準備状態を確認する

PC で次を開きます。

```text
http://127.0.0.1:3200/dashboard.html
```

A、B、C の状態を確認します。

- `online`: Test Agent が PC の Server と通信できています。
- `registered`: SIP REGISTER が完了しています。
- SIP ユーザー: A/B/C の割り当てと一致している必要があります。
- Call state: テスト開始前は原則として `IDLE` にします。

Runner は未登録端末へ `register` コマンドを送信しますが、端末自体が `online` でなければ実行できません。

## 6. 最初に Smoke Test を実行する

Server を動かしたまま、別の PowerShell を開いて実行します。

```powershell
cd C:\project\webrtc
npm run test:e:smoke
```

Smoke Test は A と B を使用し、次の 3 ケースを確認します。

1. A から B へ発信し、B が応答、A が切断
2. A から B へ発信し、B が応答、B が切断
3. A から B へ発信し、B の応答前に A が切断

最後に次の形式で結果が表示されます。

```text
===== Test E smoke: OK=3 NG=0 BLOCKED=0 total=3 =====
```

`BLOCKED_BY_SIP_ROUTE` は、SIP Server が `404 Not Found` を返し、端末間ルートを確立できなかったことを示します。Test API Server 自体の異常とは限りません。

## 7. テストケースを実行する

### ケース一覧を確認する

```powershell
npm run test:e:list
```

現在は合計 21 ケースです。

| 分類 | 件数 | 内容 |
| --- | ---: | --- |
| Inbound | 12 | 外線または B から A への着信、応答前切断、A→B、A→B→C 転送 |
| Outbound | 9 | A から外線または B への発信、応答前切断、外線通話の A→B 転送 |

詳細は [`config/scenarios.json`](config/scenarios.json) を参照してください。

### 全 21 ケースを実行する

```powershell
npm run test:e
```

### Inbound または Outbound だけ実行する

```powershell
node tools/test-e/runner/cli.mjs --inbound
node tools/test-e/runner/cli.mjs --outbound
```

### 1 ケースだけ実行する

```powershell
node tools/test-e/runner/cli.mjs --case=E-OUT-b-device-self
```

ケース ID は `npm run test:e:list` で確認できます。一致する ID がない場合、Runner はエラーで終了します。

## 8. 外線を手動操作する

calltest サービスを使用せず、実際の電話機を手動操作する場合は `--manual-external` を付けます。

```powershell
node tools/test-e/runner/cli.mjs --inbound --manual-external
node tools/test-e/runner/cli.mjs --outbound --manual-external
```

Runner に `MANUAL:` で始まる案内が表示されたら、その指示に従って発信、応答、切断を行ってください。操作が遅れると `incomingTimeoutSec` や各コマンドのタイムアウトに達するため、案内後すぐに操作します。

## 9. Runner オプション

| オプション | 用途 |
| --- | --- |
| `--list` | 対象ケースを一覧表示し、テストを実行せず終了します。 |
| `--smoke` | A/B 間の 3 ケースだけを実行します。 |
| `--inbound` | Inbound ケースだけに絞ります。 |
| `--outbound` | Outbound ケースだけに絞ります。 |
| `--case=<ID>` | 指定した 1 ケースだけに絞ります。 |
| `--manual-external` | 外線の発信・応答・切断を手動で行います。 |
| `--keep-registered` | テスト終了後も A/B/C の SIP 登録を維持します。 |
| `--reset-events` | 実行前に Server 上のイベントを消去します。 |
| `--reset-commands` | 実行前に Server 上のコマンドを消去します。 |

通常の `npm run test:e` は終了時に A/B/C へ `unregister` を送信します。Smoke Test は自動的に登録を維持します。

前回のコマンドとイベントを消して Outbound だけ再実行する例です。

```powershell
node tools/test-e/runner/cli.mjs --outbound --reset-events --reset-commands
```

## 10. 結果を確認する

各実行の結果は、リポジトリ直下の次のディレクトリに保存されます。

```text
test-results/<run-id>/summary.json
test-results/<run-id>/commands.json
test-results/<run-id>/events.json
test-results/<run-id>/runner.log
```

- `summary.json`: ケースごとの OK/NG/BLOCKED とエラー概要
- `commands.json`: Runner が端末へ送ったコマンドと完了状態
- `events.json`: 端末から届いた通話・登録イベント
- `runner.log`: Runner 内部で記録したコマンド処理状況

画面上で現在の端末状態、コマンド、イベントを確認する場合は Dashboard を使用します。

## 11. 設定を一時的に上書きする

恒久的な既定値は [`config/test-e.config.json`](config/test-e.config.json) を編集します。一時的な変更は、Runner または Server を起動する PowerShell で環境変数を設定します。

```powershell
$env:IVR_E_WEB_API_BASE="http://127.0.0.1:3200"
$env:IVR_E_INBOUND_PHONE="05000000000"
$env:IVR_E_OUTBOUND_PHONE="05000000000"
$env:IVR_E_CALLTEST_BASE="http://example.test/ajax/calltest/test"
npm run test:e
```

主な環境変数は次のとおりです。

| 環境変数 | 用途 |
| --- | --- |
| `TEST_COMMAND_HOST` | Test API Server の待受ホスト |
| `TEST_COMMAND_PORT` | Test API Server の待受ポート |
| `IVR_E_WEB_API_BASE` | Runner が接続する Test API の URL |
| `IVR_E_DEVICE_A_ID` ～ `IVR_E_DEVICE_C_ID` | A/B/C の Device ID |
| `IVR_E_DEVICE_A_AUTH_USER` ～ `IVR_E_DEVICE_C_AUTH_USER` | A/B/C の SIP ユーザー |
| `IVR_E_INBOUND_PHONE` | 外線から着信させる対象番号 |
| `IVR_E_OUTBOUND_PHONE` | 端末から発信する外線番号 |
| `IVR_E_CALLTEST_BASE` | calltest サービスのベース URL |
| `IVR_E_CONNECTED_SEC` | 接続状態を維持する秒数 |
| `IVR_E_ANSWER_AFTER_SEC` | 着信から応答までの秒数 |
| `IVR_E_TRANSFER_AFTER_SEC` | 最初の転送までの秒数 |
| `IVR_E_SECOND_TRANSFER_AFTER_SEC` | 2 回目の転送までの秒数 |
| `IVR_E_BEFORE_ANSWER_HANGUP_SEC` | 応答前切断までの秒数 |
| `IVR_E_BEFORE_TRANSFER_ANSWER_HANGUP_SEC` | 転送先応答前の切断までの秒数 |
| `IVR_E_SECOND_HANGUP_DELAY_SEC` | 操作後の安定待ち時間 |
| `IVR_E_INCOMING_TIMEOUT_SEC` | 着信待ちタイムアウト秒数 |
| `IVR_E_TOLERANCE_SEC` | 通話時間検証の許容誤差秒数 |

PowerShell の環境変数は、その PowerShell セッション内だけ有効です。Server 側の設定を変更した場合は Server を再起動し、端末を再 Provisioning してください。

## 12. Test E 自体の自動テスト

Test API、コマンド状態、タイムアウト、重複コマンド、イベント形式、Heartbeat、転送結果などのユニットテストを実行できます。

```powershell
npm run test:test-e
```

これは実機通話テストではなく、Test E ツールの内部ロジックを確認するテストです。

## 13. トラブルシューティング

### 端末が `offline` のまま

- Android 端末で WebRTC App が起動していることを確認します。
- Test Agent Server URL に PC の LAN IP が設定されていることを確認します。
- PC と端末が同じ LAN にあり、相互通信できることを確認します。
- PC の Firewall で TCP `3200` 番ポートを許可します。
- Android 端末のブラウザで `http://<PC-LAN-IP>:3200/dashboard.html` が開けるか確認します。

### SIP 登録に失敗する

- SIP WebSocket URL、ドメイン、パスワードを確認します。
- A/B/C の SIP ユーザーが別端末と重複していないことを確認します。
- Dashboard の SIP ユーザーが `webrtc_101`、`webrtc_102`、`webrtc_103` の割り当てと一致していることを確認します。
- 設定が違う場合は、正しい A/B/C ボタンから再 Provisioning します。

### `command ... timed out` になる

- 対象端末が `online` か確認します。
- WebRTC App がバックグラウンド制限や省電力設定で停止されていないか確認します。
- Dashboard の Commands で、状態が `queued`、`delivered`、`completed`、`failed` のどこで止まっているか確認します。
- 必要に応じて `--reset-events --reset-commands` を付けて再実行します。

### `SIP identity mismatch` になる

端末へ設定された SIP ユーザーと、A/B/C に期待される SIP ユーザーが一致していません。端末の割り当てと `test-e.config.json` または `IVR_E_DEVICE_*_AUTH_USER` を確認してください。

### 外線ケースだけ失敗する

- `inboundPhone` と `outboundPhone` の番号を確認します。
- calltest サービスの URL と接続可否を確認します。
- 自動外線制御が利用できない場合は `--manual-external` を使用します。
- 実際の電話番号ルーティングが Test E の想定どおりか確認します。

### 履歴を初期化したい

次のどちらかを行います。

```powershell
node tools/test-e/runner/cli.mjs --case=E-OUT-b-device-self --reset-events --reset-commands
```

または Server を停止して再起動します。Server の commands/events はメモリ内保存のため、再起動すると消去されます。

## 14. 注意事項

- `test-e.config.json` にはテスト用 SIP 情報が含まれます。本番アカウントの認証情報を直接保存しないでください。
- `0.0.0.0:3200` で起動すると LAN 内の他端末からアクセスできます。信頼できるテストネットワーク内だけで使用してください。
- 全 21 ケースは実際に発信、応答、切断、転送を行います。使用する番号とテスト時間帯を事前に確認してください。
- 転送テストは JsSIP の REFER 結果と端末イベントに依存します。SIP Server 側の転送設定も確認してください。
