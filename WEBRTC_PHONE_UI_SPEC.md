# WebRTC Phone App UI 仕様書

## 作業対象

- WebRTC Phone App
- Android WebView + Java + `app.js` + `style.css` + `index.html`

## 重要方針

- すでに反映済みの修正は重複して変更しない。
- 未反映または不完全な箇所のみ最小限修正する。
- 無関係な大規模リファクタリングは禁止。
- SIP / WebRTC / 通話仕様そのものは変更しない。
- 旧処理を残して関数冒頭で `return` するだけの修正は禁止。
- 画面遷移、click handler、DOM id、CSS class の不整合を重点的に確認する。
- 修正後は Android Emulator で実表示確認する。
- 確認できなかった項目は「未確認」と明記する。

## 1. UI 全体仕様

このアプリはスマホ向け WebRTC 通話アプリであり、Android WebView 上で自然に見える UI にする。

対象画面:

- 初期設定画面
- SIP アカウント設定画面
- キーパッド画面
- 通話中画面
- 履歴画面
- 履歴詳細画面
- 連絡先画面
- 連絡先新規作成 / 編集画面
- お気に入り画面
- 設定画面
- 下部メニュー

共通 UI 方針:

- スマホ幅で左右余白を取りすぎない。
- 画面中央に細く表示されない。
- 横スクロールを出さない。
- 文字は小さすぎず、大きすぎない。
- 入力欄、ボタン、カードの高さを統一する。
- iOS 風の軽いカード UI を基本にする。
- Android WebView でも表示崩れしない。
- PC ブラウザ表示を大きく壊さない。

確認項目:

- Android 9 Emulator で表示確認。
- Android 10 Emulator で表示確認。
- スマホ幅で自然に表示されること。
- 文字・ボタン・カードが重ならないこと。
- 横スクロールが出ないこと。
- 下部メニューに本文が隠れないこと。

## 2. Bottom Navigation 仕様

下部メニューはスマホアプリの TabBar として自然に表示する。

対象タブ:

- 履歴
- キーパッド
- 連絡先
- お気に入り

仕様:

- 画面下部に fixed 表示。
- スクロールしても常に画面下部に表示。
- 本文に重ならないよう body / main に padding-bottom を確保。
- 少し浮いて見える pill / card 形状。
- 左右に適度な余白。
- 角丸。
- 薄い border。
- 薄い shadow。
- iOS TabBar 風。
- 選択中 tab は色または自然な背景で分かるようにする。
- 選択中でも高さ・位置・icon size を変えない。
- 黄色い focus outline を出さない。
- ただし focus-visible は UI に合う形で残す。

各 tab の layout:

```css
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
```

追加条件:

- icon size 統一。
- label font-size 統一。
- tab height 統一。
- icon と文字を 1 つのグループとして中央配置。

完了条件:

- 4 つの tab の icon / label が完全に揃う。
- 選択中でも位置が変わらない。
- 黄色い outline が出ない。
- 本文と重ならない。
- Android 9 / 10 Emulator で自然に見える。

## 3. キーパッド画面仕様

仕様:

- 上部にアカウント状態を表示。
- ダイヤル入力欄を表示。
- 数字キーパッドを表示。
- 発信ボタンを表示。
- 最近の履歴を最新 3 件だけ表示。
- 最近の履歴は確認用であり、全履歴は履歴画面に表示する。

最近の履歴仕様:

- 最新 3 件のみ表示。
- 通話履歴全体は表示しない。
- 表示名ルールは履歴画面と同じ。
- 電話番号が連絡先に登録されている場合は連絡先名を優先。
- 必要に応じて電話番号 / SIP URI を小さいサブテキストで表示。
- 最近履歴をクリックした場合は履歴詳細画面へ遷移。
- 詳細画面から戻るとキーパッド画面へ戻る。

確認項目:

- 最新 3 件だけ表示されること。
- 4 件以上表示されないこと。
- 連絡先名が優先表示されること。
- 未登録番号は電話番号または SIP URI が表示されること。
- 最近履歴クリックで詳細画面へ遷移すること。

## 4. 通話中画面仕様

通話中画面では、電話番号・状態・通話時間・終了ボタンが重ならないようにする。

修正方針:

- 電話番号
- 通話状態
- 通話時間
- 通話終了ボタン
- その他操作ボタン

これらを縦方向の通常 flow layout で自然に並べる。

禁止:

- 電話番号の上に通話終了ボタンを absolute で重ねること。
- negative margin で無理に詰めること。
- transform で重ねること。

完了条件:

- 電話番号が通話終了ボタンに隠れない。
- 通話時間がボタンに隠れない。
- 通話終了ボタンが中央に自然に表示される。
- Android 9 / 10 Emulator で重ならない。

## 5. 履歴画面仕様

仕様:

- 履歴画面では全履歴を表示。
- 「すべて」「不在着信」などのフィルタを使用可能。
- 各履歴行はクリック可能。
- 感嘆符 / 詳細ボタンが必要な場合は表示。
- 履歴行クリックまたは詳細ボタン押下で履歴詳細画面へ遷移。
- popup / alert は使用しない。

表示名優先順位:

1. CTI 側で指定された表示名
2. アドレス帳 / 連絡先に登録されている名前
3. 電話番号
4. SIP URI

この表示ルールは以下すべてで共通:

- 履歴一覧
- キーパッド画面の最近の履歴
- 履歴詳細画面

想定関数:

- `buildCallHistoryViewModel(item)`
- `renderFullCallHistoryList()`
- `renderRecentCallHistoryList()`
- `showHistoryDetails(originalIndex)`

履歴描画方針:

- 履歴画面: フィルタ後の全履歴。
- キーパッド画面: 最新 3 件のみ。
- 両者の描画処理を分ける。
- フィルタ後 index ではなく `originalIndex` を使う。

完了条件:

- 履歴行クリックで詳細画面へ遷移。
- 感嘆符ボタンでも詳細画面へ遷移。
- popup / alert は使わない。
- 詳細画面から戻ると元画面へ戻る。
- 履歴画面から入った場合は履歴画面へ戻る。
- 最近履歴から入った場合はキーパッド画面へ戻る。
- 詳細を押してダイヤル画面へ戻る問題が解消されている。

履歴詳細画面の表示項目:

- 表示名
- 電話番号 / SIP
- 種別
- 状態
- 日時
- 通話時間
- 店舗名
- CTI名
- アドレス帳名

## 6. 連絡先画面仕様

連絡先画面では、登録済みの連絡先を一覧表示し、新規追加・編集・検索・お気に入り登録ができるようにする。

### 6-1. 新規連絡先追加

完了条件:

- 「＋」ボタンを押すと新規連絡先作成画面が表示される。
- 名前、電話番号、SIP URI を入力できる。
- 保存後、連絡先一覧に反映される。
- キャンセル時、連絡先一覧へ戻る。

確認項目:

- 「＋」ボタンの id / class / data-action。
- app.js 側の click handler。
- handler 登録タイミング。
- 新規連絡先画面の DOM。
- `showContactEdit()` / `showContactForm()` / `showPage()` / `showTab()` / `navigateTo()`。
- page id / tab id の一致。

### 6-2. 連絡先検索欄

仕様:

- 連絡先画面を開いた直後は検索欄を表示しない。
- 検索ボタンを押したときだけ検索欄を表示。
- もう一度検索ボタン、または閉じる操作で非表示。
- 他画面から戻ったときに不要な検索欄が残らない。

完了条件:

- 初期表示では検索欄がない。
- 検索ボタン押下で表示。
- 閉じる / 再押下で非表示。
- 検索欄が表示されている間だけ検索できる。

### 6-3. 連絡先空状態

仕様:

- 「連絡先はまだありません。」をカードまたは中央寄せ気味に表示。
- 可能なら「＋から連絡先を追加できます」のような補足を表示。
- 上部に不自然な余白を作らない。
- 下部メニューと重ならない。

### 6-4. 連絡先名の利用

電話番号が連絡先に登録されている場合、以下で電話番号より連絡先名を優先する。

- 履歴一覧
- 最近の履歴
- 履歴詳細
- 発信前表示
- 着信表示

## 7. お気に入り画面仕様

仕様:

- 下部メニューに「お気に入り」を表示。
- 連絡先からお気に入り登録 / 解除できる。
- お気に入り画面にはお気に入り登録済みの連絡先のみ表示。
- 空の場合は自然な空状態表示。
- 画面デザインは連絡先画面と統一。

確認項目:

- お気に入りタブが表示される。
- お気に入りタブを押すとお気に入り画面へ遷移する。
- 登録済みのお気に入りが表示される。
- 空状態が自然。
- Bottom Navigation の icon / label が揃っている。

## 8. SIP アカウント設定画面仕様

修正方針:

- スマホ幅ではメインコンテナを画面幅いっぱいに近づける。
- 左右余白を小さくする。
- card width: 100%。
- max-width は必要最小限。
- input font-size を少し下げる。
- title font-size をスマホ向けに調整。
- 長い URL / SIP URI が見切れにくいようにする。
- 横スクロールを出さない。

確認項目:

- WebSocket URL が自然に表示される。
- SIP URI が自然に表示される。
- ボタンが見切れない。
- Android 9 / 10 Emulator で崩れない。

## 9. Android 9 / Android 10 WebView 互換仕様

既存対応:

- Android 10 以下では WebView を `LAYER_TYPE_SOFTWARE` にする。
- `font-weight: 800` を `600` 程度に下げる。
- WebView wide viewport / overview zoom を app UI 向けに調整。

確認項目:

- Android 9 Emulator で起動できる。
- Android 10 Emulator で起動できる。
- 初期設定画面が正常表示される。
- `RasterCHROMIUM` / `Invalid font buffer` が再発しない。
- software rendering で他画面が崩れない。
- 起動後しばらく放置しても落ちない。
- Logcat に Fatal Exception / ANR / Unhandled Exception が出ない。

## 10. ログ送信仕様

仕様:

- ユーザー向け表示は簡潔でよい。
- サポート / 開発者向けログには詳細を残す。
- ログ送信失敗でアプリが落ちない。
- native log が空でも JS 診断レポートがあれば送信本文に含める。
- 送信前に本文長、native log 長、追加 context 長をログに残す。
- 画面表示ではログエントリ間を改行し、各ログ時刻を行頭に表示する。
- ホーム画面の右上メニューに「ログ送信」を表示し、そこから既存のログ送信処理を実行できるようにする。
- 右上メニューの「ログ送信」を押したらメニューを閉じ、送信開始・成功・失敗の既存フィードバックを表示する。

失敗分類例:

- `log_file_missing`
- `network_error`
- `timeout`
- `server_error`
- `auth_error`
- `provisioning_info_missing`
- `unexpected_exception`

確認ログ例:

- `Log upload part completed: part=1/3`
- `Log upload part completed: part=2/3`
- `Log upload part completed: part=3/3`
- `Log upload completed: reason=manual_log`

## 11. プロビジョニング仕様

以下の場合でもアプリが落ちないようにする。

- URL 未設定
- 通信失敗
- timeout
- 空レスポンス
- JSON 不正
- 必須項目不足
- 認証失敗
- 保存済み設定なし
- 保存済み設定破損

取得失敗時:

- 有効な保存済み設定がある場合はそれを使って動作継続。
- 既存設定も使えない場合はアプリを落とさず、設定不足として扱う。
- エラー内容をログに残す。

確認項目:

- 正常な provisioning が適用される。
- 不正 JSON で落ちない。
- 通信失敗で落ちない。
- 保存済み設定がある場合は継続できる。
- エラー分類がログに残る。

## 12. Android テストアカウント

Android Emulator で SIP 接続確認する場合、以下を使用する。

```text
WebSocket:
wss://test202102.mimio.jp:443/webrtc/ws

SIP:
sip:3bd92260-120@test202102.mimio.jp

Auth User:
3bd92260-120

Password:
120
```

確認したいログ:

- WebSocket 接続完了
- SIP 登録が完了しました

## 13. 画面遷移仕様

重点確認:

- `showPage()`
- `showTab()`
- `navigateTo()`
- `setActiveScreen()`
- 各画面の DOM id
- `data-tab`
- `data-action`
- click handler
- 許可リスト
- fallback 処理

修正方針:

- 存在する画面 id と JS 側の遷移名を一致させる。
- 新規画面を追加した場合は navigation の許可リストに追加。
- 不明な page 名で安易に dial に fallback しない。
- fallback する場合も内部ログに warning を残す。

## 14. 確認コマンド

JavaScript:

```powershell
node --check app.js
```

差分:

```powershell
git diff --check
```

Android:

```powershell
:app:assembleDebug
```

可能であれば:

- Android 9 Emulator に install / 起動。
- Android 10 Emulator に install / 起動。
- Logcat 確認。

確認する Logcat:

- Fatal Exception がない。
- ANR がない。
- Unhandled Exception がない。
- `RasterCHROMIUM` が再発していない。
- `Invalid font buffer` が再発していない。
- WebSocket 接続完了。
- SIP 登録完了。
- `Log upload completed`。

## 15. 最優先で直す問題

1. 連絡先の「＋」から新規連絡先作成画面が開くこと。
2. 履歴行 / 感嘆符ボタンから履歴詳細画面へ遷移すること。
3. 履歴詳細がダイヤル画面に fallback しないこと。
4. Bottom Navigation の icon / label を正しく揃えること。
5. 通話中画面で「通話終了」ボタンが番号・時間に重ならないこと。
6. 連絡先検索欄を初期非表示にすること。
7. Android 9 / 10 で表示崩れ・crash がないこと。
8. ログ送信・プロビジョニングを確認すること。

## 16. 最終報告形式

最後に以下を報告する。

- 修正したファイル
- 修正した関数
- 各問題の原因
- 各問題の修正内容
- Android 9 で確認できたこと
- Android 10 で確認できたこと
- build / syntax check の結果
- UI 実表示確認の結果
- 未確認項目
- 残っている問題
- 次に確認すべきこと

報告時は、「build 成功」「SIP 登録成功」だけで完了扱いにしない。
今回の主目的は UI と画面遷移の修正であり、各 UI 問題が実際に改善したかを項目ごとに確認する。
