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
2. 共通関数 `maskSensitiveText` でメールアドレス、API key らしき文字列、ローカルパスを最低限マスクする
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

### mobile import の重複検知

取り込み履歴は出力先の `logs/.mobile-import-history.json` に保存します。
`--output-dir PATH` 指定時は `PATH/logs/.mobile-import-history.json` です。
日付と、本文の CRLF→LF 変換・前後 trim のみを行った値の SHA-256 で比較します。
同じ日付・同じ正規化本文は追記をスキップし、`Skip duplicate:` を表示します。
同じ日付の異なる本文、異なる日付の同じ本文は取り込みます。日次ログの Markdown 形式は維持します。

履歴がなければ新規扱いです。導入前の取り込みは検知対象外です。
履歴を削除すると重複検知できなくなるため、ログと一緒に保管してください。
履歴の JSON・バージョン・エントリ形式が壊れている場合は、ログや元ファイルの変更前にエラーにします。

重複した元ファイルも入力元の `archive/` へ移動します。
同名が存在する場合は `YYYY-MM-DD.1.md`、`.2.md` のように連番を付け、既存ファイルを上書きしません。
archive 保存は上書き禁止のコピー後に元ファイルを削除します。
処理順は「ログ保存→履歴保存→archive移動」です（重複時はログ・履歴保存を省略）。
archive移動失敗後の再実行では履歴により追記をスキップします。
ただし、ログ保存後・履歴保存前の失敗では再実行時に重複が残り得ます。
ログと履歴の更新はトランザクションではなく、同じ出力先への並行取り込みは想定していません。

`--dry-run` は本文と履歴を読み、追記または重複スキップとarchive先の予定を表示します。
ログ・履歴・archive・元ファイルは変更しません。

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

実装済みです。

通常の `--advice` は AI なしで利用でき、`logs` から直近3件の日次ログを読み込み、古い日付から順にログ内容と振り返り質問を stdout に表示します。

`--advice --advice-provider ollama` を指定すると、直近3件のログをローカルOllamaへ渡して AI による助言を生成し、結果の JSON を stdout に表示します。接続先は `http://127.0.0.1:11434/api/chat`、使用モデルは `qwen3.5:9b` です。Ollamaの起動とモデルの取得が必要です。

`--advice-provider ollama` 指定時のfetch接続失敗は、Ollamaの起動と接続先の確認を促す日本語エラーへ変換し、元のエラーを `cause` に保持します。HTTPエラーとレスポンス形式エラーは、それぞれ既存の処理で扱います。

`--sanitize-advice` 指定時は、読み込んだログから新しいオブジェクトを作り、`content` にだけ `maskSensitiveText` を適用して `buildAdviceInput(logs, true)` へ渡します。日付・順序・元ファイルは保持し、長文省略・空白整理・改行変換は行いません。`buildAdviceInput` 自体はマスク処理を行いません。未指定時は本文を保持し `sanitized: false` とします。`sanitized: true` は限定的なマスク適用済みという意味で、人名などを含む完全な匿名化を示しません。

新オプションは `--advice --advice-provider ollama` を必須とし、`--output-dir` と併用できます。別処理（safe-share、stats、月次・週次サマリー、import、dry-run）、本文引数、`--memo`、`--date` との併用は拒否します。`--help` / `-h` では新オプションの依存・組み合わせ検証を省略してhelpを表示します。既存の引数処理は新オプション未指定時には変更しません。

Ollama応答は `parseAdviceOutput` でJSONの構造と型を確認した後、`validateAdviceEvidenceDates` で日付の整合性を検証します。`recordedStatements` と `selfEvaluations` の各 `date` は入力の `logs` に存在する必要があります。同日付の複数記述と空配列は許可します。不一致のエラーには項目名・配列インデックス・対象日付を含めます。`repeatedPatterns` の各 `evidenceDates` は入力ログに存在する重複のない2日以上を必要とし、`repeatedPatterns` 自体は空配列を許可します。検証は入力・出力オブジェクトを変更しません。日付が整合していても記述内容そのものの根拠を保証するものではなく、内容の根拠確認は未実装です。

### `--mirror-stats` / `--mirror-advice`

未実装です。

`mirror-logs` 自体の責務や形式がまだ確定していないため、現時点ではコード上の責務を持ちません。

## 将来の拡張方針

無理に一度に多機能化せず、現在の実装を土台に段階的に広げます。

1. ログ読み出し処理の整理・共通化
2. `--advice` の振り返り質問とOllamaによる助言の品質を改善する
3. 実装済みの AI 助言生成の入力・出力設計を見直し、再現性の検証を進める
4. `mirror-logs` の責務と形式を定義する
5. 必要に応じて `--mirror-stats` / `--mirror-advice` を設計する
