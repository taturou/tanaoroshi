# 設計書

## 1. システム概要
- 対象: スーパーマーケット等の現場で、スマートフォン単体で棚卸しを行うための PWA です。
- 実行方式: 完全クライアントサイドです。アプリデータはブラウザ `localStorage` に保存します。
- 提供機能:
  - JAN/EAN バーコードのカメラ読取
  - 商品名・メーカー名・商品画像の自動取得
  - OCR による商品名補完
  - 商品分類タグ付け
  - 数量登録、編集、削除、検索
  - CSV エクスポート / インポート
  - PWA インストールと更新通知

## 2. 設計方針
- KISS: サーバー、認証、DB を持たず、1 端末で完結する構成を維持します。
- DRY: 在庫データ操作は `useInventory`、設定値管理は `useSettings` に集約します。
- 障害分離: 外部 API 失敗時でも、手入力と OCR により棚卸し継続を可能にします。
- モバイル優先: `100dvh` と固定ボトムナビゲーション前提で、iPhone 系ブラウザの表示崩れを抑制します。

## 3. 技術スタック
- フロントエンド: React 19 + TypeScript
- ビルド: Vite 7
- PWA: `vite-plugin-pwa`
- バーコード読取: `@zxing/browser`, `@zxing/library`
- OCR: `tesseract.js`
- アイコン: `lucide-react`
- スタイル: 単一 CSS (`src/index.css`)
- 永続化: `localStorage`

## 4. 画面構成

### 4.1 スキャンタブ
- 初期表示は「スキャン開始」ボタンのみ表示します。
- スキャン開始後はカメラプレビューと「スキャンを停止」ボタンを表示します。
- 読取成功後は登録フォームへ遷移します。
- 登録フォームは以下の 2 分割です。
  - 上部: スクロール可能な商品情報エリア
  - 下部: 数量操作と保存 / キャンセルの固定アクションエリア

### 4.2 リストタブ
- 保存済みデータを新しい順で表示します。
- 商品名、メーカー名、分類、JAN コードで全文検索します。
- 数量の直接変更、商品情報編集、削除を実行できます。
- 編集はモーダルダイアログで行います。

### 4.3 設定タブ
- Yahoo! Shopping API Client ID を保存します。
- 担当者名を保存します。
- CSV エクスポート / インポートを実行します。
- PWA 更新確認を手動実行できます。
- 全件削除を実行できます。

## 5. 主要ユースケース

### 5.1 新規商品登録
1. ユーザーがスキャンを開始します。
2. ZXing が `EAN_13` / `EAN_8` を検出します。
3. `App.tsx` が商品情報取得を試行します。
4. Yahoo! API で取得できなければ Open Food Facts を試行します。
5. それでも取得失敗なら、手入力または OCR へフォールバックします。
6. 数量を確定し保存します。

### 5.2 既存商品の再読取
1. 同一 JAN が `items` に存在するか判定します。
2. 既存データをフォームへ復元します。
3. 数量は `既存数量 + 1` を初期値にします。
4. 保存時は同一レコードを上書きし、`scannedAt` を更新して先頭へ移動します。

### 5.3 CSV 取込
1. ユーザーが CSV を選択します。
2. `merge` または `replace` を確認ダイアログで選択します。
3. 1 行ずつパースして `InventoryItem` 化します。
4. `merge` では同一 JAN を数量加算、`replace` では全件置換します。

## 6. データ設計

### 6.1 在庫データ `InventoryItem`
ソース: [src/types.ts](/home/h-morishita/program/tanaoroshi/src/types.ts)

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | `string` | クライアント生成 UUID |
| `janCode` | `string` | JAN/EAN コード |
| `productName` | `string` | 商品名 |
| `manufacturerName` | `string?` | メーカー名 / ブランド名 |
| `category` | `string?` | 商品分類タグ |
| `imageUrl` | `string?` | 商品画像 URL または撮影画像 Data URL |
| `userName` | `string?` | 入力担当者名 |
| `quantity` | `number` | 数量 |
| `scannedAt` | `number` | UNIX epoch milliseconds |

### 6.2 `localStorage` キー
- `tanaoroshi_inventory`
  - 在庫配列全体を JSON 保存します。
- `tanaoroshi_settings_client_id`
  - Yahoo! Shopping API Client ID を保存します。
- `tanaoroshi_settings_user_name`
  - 担当者名を保存します。
- `tanaoroshi_settings_categories`
  - 分類タグ一覧を保存します。

## 7. コンポーネント設計

### 7.1 `App`
ソース: [src/App.tsx](/home/h-morishita/program/tanaoroshi/src/App.tsx)

- 役割:
  - タブ切替
  - スキャン状態管理
  - 商品登録フォーム制御
  - API 呼び出し
  - OCR 呼び出し
  - CSV 入出力起点
- 状態:
  - `activeTab`, `isScanning`, `scannedJan`
  - フォーム入力 (`productNameInput`, `manufacturerInput`, `categoryInput`, `quantityInput`, `imageUrlInput`)
  - API/OCR 状態 (`isFetchingName`, `isApiFetched`, `isOcrProcessing`, `apiError`)
  - 既存商品判定 (`isExistingItem`, `originalQuantity`)
  - リスト検索 (`searchQuery`)
  - 編集ダイアログ (`editingItem`)

### 7.2 `Scanner`
ソース: [src/components/Scanner.tsx](/home/h-morishita/program/tanaoroshi/src/components/Scanner.tsx)

- 役割:
  - カメラ起動
  - JAN/EAN の連続読取
  - 読取成功時の停止
  - 状態メッセージ表示
- 実装要点:
  - 対象フォーマットは `EAN_13`, `EAN_8` に限定します。
  - `TRY_HARDER` を有効にし、認識率を優先します。
  - `facingMode: environment` を指定し、背面カメラを優先します。
  - タップ時に `focusMode: continuous` を再適用し、フォーカス再調整を試みます。
- UI 制約:
  - `maxHeight: calc(100dvh - 300px)` により、スマホ縦画面で全体スクロールを避けます。

### 7.3 `ReloadPrompt`
ソース: [src/components/ReloadPrompt.tsx](/home/h-morishita/program/tanaoroshi/src/components/ReloadPrompt.tsx)

- 役割:
  - PWA Service Worker の登録状態を監視
  - オフライン利用可能通知
  - 更新可能時の明示リロード導線

### 7.4 `useInventory`
ソース: [src/hooks/useInventory.ts](/home/h-morishita/program/tanaoroshi/src/hooks/useInventory.ts)

- 責務:
  - 在庫配列の読み書き
  - 追加 / 上書き保存 / 数量更新 / 削除 / 全削除
  - CSV エクスポート / インポート
- 設計上の前提:
  - 一意性キーは `id` ではなく `janCode` です。
  - 同一 JAN の複数レコード保持はしません。
- トレードオフ:
  - 単一レコードへ集約するため、同一商品の棚・時点別の履歴は失われます。
  - `localStorage` 保存のため、大量画像 Data URL を保持すると容量上限に到達しやすいです。

### 7.5 `useSettings`
ソース: [src/hooks/useSettings.ts](/home/h-morishita/program/tanaoroshi/src/hooks/useSettings.ts)

- 責務:
  - Client ID、担当者名、分類タグの永続化
- 初期分類:
  - `飲料`
  - `食品`
  - `日用品`

## 8. 外部連携設計

### 8.1 Yahoo! Shopping API
- 用途: 第一優先の商品情報取得元です。
- 呼出条件: `clientId` 設定済みの場合のみ実行します。
- エンドポイント: `ShoppingWebService/V3/itemSearch?jan_code=...`
- CORS 対策:
  - `allorigins`
  - `corsproxy.io`
- タイムアウト: 各リクエスト 8 秒
- リトライ: 最大 2 回

### 8.2 Open Food Facts
- 用途: Yahoo! で取得できなかった場合の第二候補です。
- 利点:
  - Client ID 不要
- 制約:
  - 食品以外の網羅率は低いです。
  - 商品名・ブランド名の揺れがあります。

### 8.3 OCR (`tesseract.js`)
- 用途: API で商品名が取得できない場合の補助手段です。
- 言語: `jpn`
- 入力: カメラ撮影画像
- 出力制約:
  - 改行をスペース化してから先頭 50 文字へ切り詰めます。
- トレードオフ:
  - 初回ロードと解析が重く、低性能端末では待機時間が長いです。
  - 認識精度はパッケージ写真品質に依存します。

## 9. CSV 仕様

### 9.1 出力列
- `JANコード`
- `商品名`
- `メーカー名`
- `商品分類`
- `数量`
- `スキャン日時`
- `ユーザ名`

### 9.2 出力仕様
- 文字コード: UTF-8 with BOM
- 目的: Excel 文字化け回避
- ファイル名: `棚卸しデータ_YYYYMMDD.csv`

### 9.3 取込仕様
- 先頭行をヘッダーとして無視します。
- ダブルクォートを考慮した簡易 CSV パーサを内包します。
- 7 列未満でも最低限の列があれば読込継続します。

## 10. PWA / デプロイ設計
- 設定ファイル: [vite.config.ts](/home/h-morishita/program/tanaoroshi/vite.config.ts)
- `registerType: 'prompt'` を採用します。
  - 理由: 棚卸し作業中の自動更新で UI 状態を失わないためです。
- `base: './'` を指定します。
  - 理由: GitHub Pages 配下でも相対パスで動かすためです。
- マニフェスト:
  - `name`: `棚卸しアプリ`
  - `short_name`: `棚卸し`
  - `display`: `standalone`

## 11. レイアウト設計
- ルートコンテナは `height: 100dvh` です。
- ヘッダー固定、メイン領域固定、ボトムナビ固定の三層構成です。
- 誤操作防止のため、全体ではテキスト選択を無効化し、入力欄のみ許可します。
- スキャン画面:
  - 全画面スクロールを抑制
  - アクションボタンは下部固定
- 編集モーダル:
  - `max-width: 400px`
  - `max-height: 90vh`

## 12. 既知の制約とリスク

### 12.1 設計上の制約
- サーバーレスのため、端末間自動同期はありません。
- `localStorage` のため、容量と信頼性はブラウザ実装依存です。
- 同一 JAN を単一レコードへ集約するため、履歴管理には不向きです。

### 12.2 外部依存リスク
- Yahoo! API は CORS 回避プロキシに依存しており、安定性・可用性が保証されません。
- Open Food Facts は商品カバレッジに偏りがあります。
- OCR は端末性能と撮影品質に強く依存します。

### 12.3 実装上の注意
- `handleSaveEdit` は `addOrUpdateItem` を経由するため、編集対象の商品がリスト先頭へ再配置されます。
- `importCSV(mode='merge')` は既存数量へ加算しますが、商品名や分類は更新しません。
- 画像を Data URL で保存するため、写真多用時は保存上限に達しやすいです。

## 13. 今後の改善候補
- `IndexedDB` への移行
  - 根拠: 画像保存と大量データ保持で `localStorage` の制約が厳しいためです。
- API 呼出用の軽量 BFF 導入
  - 根拠: 公開プロキシ依存を排除し、CORS とレート制御を安定化できるためです。
- 棚 / ロケーション概念の追加
  - 根拠: 同一 JAN の複数場所管理に必要です。
- 差分同期または手動バックアップ強化
  - 根拠: 端末故障時のデータ消失リスクが高いためです。
- 自動テスト追加
  - 根拠: CSV パース、同一 JAN 更新、OCR/API フォールバックは回帰しやすいためです。
