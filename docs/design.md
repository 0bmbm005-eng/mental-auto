# design.md

## 目的

`mental-auto` は、日々の短いメモを JST 基準で `logs/YYYY-MM-DD.md` にそろえて残すための CLI です。現時点では「まず確実に保存できること」を優先した最小構成です。

## 現在の設計

構成:

- CLI 本体: [src/index.ts](src/index.ts)
- 運用診断: [src/doctor.ts](src/doctor.ts)
- 共有前整形: [src/safe-share.ts](src/safe-share.ts)
- テスト: [test/index.test.ts](test/index.test.ts)

処理の流れ:

1. 引数を解釈する
2. 対象日を JST で決める、または `--date` で受ける
3. Markdown 本文を `# YYYY-MM-DD` 形式で作る
4. `logs/YYYY-MM-DD.md` へ書き込む

`mobile-inbox` import の処理:

1. `--import-mobile FILE_OR_DIR` を受ける
2. ファイル名 `YYYY-MM-DD.md` から日付を読む
3. 対応する `logs/YYYY-MM-DD.md` を開くか新規作成する
4. `## Mobile notes` セクションへ Markdown 本文を追記する
5. 取り込み元を `archive/` へ移動する
6. `--dry-run` では予定だけ表示し、書き込みと移動を行わない

`safe-share` の処理:

1. 入力を文字列または既存ファイルとして受ける
2. メールアドレス、API key らしき文字列、ローカルパスを最低限マスクする
3. 長すぎる行を省略する
4. 不要空白を整理して stdout に出す

`doctor` の処理:

1. Node.js version を確認する
2. `package.json` / `dist/` / `logs/` / `tsconfig.json` の存在を確認する
3. `dist/index.js` を見て build 済みか確認する
4. `logs/` 配下へ一時ファイルを書いて削除し、書き込み可能か確認する

## 設計判断

### JST 固定

- ローカル環境のタイムゾーン差で日付がずれないようにするため
- 日本語運用前提のログ用途と相性がよいため

### 1日1ファイル

- ファイル名だけで日付が分かる
- Git 差分や手動編集と相性がよい
- 集計や変換をあとから足しやすい

### mobile-inbox を別導線にする

- iPhone 由来の Markdown を PC 側の正本ログへ後から寄せたい
- 本文解析よりファイル名ベースの方が MVP として壊れにくい
- 取り込み後に archive へ移すことで再取り込みを避けやすい

### `## Mobile notes` セクションに寄せる

- 既存 PC メモと mobile 由来メモを見分けやすい
- mobile 由来の内容を通常の追記エントリと区別して保持できる
- 既存ログ形式を大きく崩さず拡張できる

### same-day append を採用

same-day append は実装済みです。

同じ日付のログがすでに存在する場合、既存内容を上書きせず、新しいメモを末尾に追記します。

追記エントリには次の形式のタイムスタンプ見出しを付けます。

`## Entry YYYY-MM-DD HH:mm:ss JST`

理由:

- 既存の記録を残したまま、1日に複数回メモできる
- 同日再実行による過去の記録の消失を防げる
- 日次ファイルという基本構造を維持したまま記録回数を増やせる

## `logs` と `mirror-logs`

### `logs`

- 実装済み
- 人間が読む Markdown 正本

### `mirror-logs`

- 未実装
- 将来、機械処理向けの派生データ置き場になる可能性はある
- ただし現時点では形式・保存契機・責務を確定していない

この段階では、README には「未実装」とだけ書くのが正しいです。

## 読み取り機能と未実装オプション

### `--stats`

実装済みです。

`logs` を読み取り、保存されているログの記録状況や月ごとの傾向を集計して stdout に表示します。

### `--advice`

第一段階まで実装済みです。

`logs` から最新の日次ログを特定し、その内容を読み込んで stdout に表示します。

現時点では AI による助言生成は行いません。将来の助言機能へ進む前の、ログ読み出し機能として扱います。

### `--mirror-stats` / `--mirror-advice`

未実装です。

`mirror-logs` 自体の責務や形式がまだ確定していないため、現時点ではコード上の責務を持ちません。

## 将来の拡張方針

無理に一度に多機能化せず、現在の実装を土台に段階的に広げます。

1. ログ読み出し処理の整理・共通化
2. `--advice` で読み出したログを振り返りに活用する方法を設計する
3. AI による助言生成の入力・出力・再現性を設計する
4. `mirror-logs` の責務と形式を定義する
5. 必要に応じて `--mirror-stats` / `--mirror-advice` を設計する