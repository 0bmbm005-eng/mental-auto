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

`--stats` と `--advice` のファイル選別は `readDailyLogFiles` で共通化しています。`logs/` 直下の通常ファイルを対象に、拡張子 `.md` と既存の `validateDate` で `YYYY-MM-DD` 形式・実在日付を確認し、不適合な名前を除外します。探索順は維持し、各呼び出し側で従来どおり日付順に並べます。advice は直近3件を古い順に読み込みます。探索・本文読み込みのファイルシステムエラーは従来どおり伝播します。

実装済みです。

`logs` を読み取り、保存されているログの記録状況や月ごとの傾向を集計して stdout に表示します。

### `--advice`

実装済みです。

通常の `--advice` は AI なしで利用でき、`logs` から直近3件の日次ログを読み込み、古い日付から順にログ内容と振り返り質問を stdout に表示します。

`--advice --advice-provider ollama` を指定すると、直近3件のログをローカルOllamaへ渡して AI による助言を生成し、結果の JSON を stdout に表示します。接続先は `http://127.0.0.1:11434/api/chat`、使用モデルは `qwen3.5:9b` です。Ollamaの起動とモデルの取得が必要です。

`--advice-provider ollama` 指定時のfetch接続失敗は、Ollamaの起動と接続先の確認を促す日本語エラーへ変換し、元のエラーを `cause` に保持します。HTTPエラーとレスポンス形式エラーは、それぞれ既存の処理で扱います。

`--sanitize-advice` 指定時は、読み込んだログから新しいオブジェクトを作り、`content` にだけ `maskSensitiveText` を適用して `buildAdviceInput(logs, true)` へ渡します。日付・順序・元ファイルは保持し、長文省略・空白整理・改行変換は行いません。`buildAdviceInput` 自体はマスク処理を行いません。未指定時は本文を保持し `sanitized: false` とします。`sanitized: true` は限定的なマスク適用済みという意味で、人名などを含む完全な匿名化を示しません。

`--sanitize-advice` と `--preview-advice` は `--advice --advice-provider ollama` を必須とし、互いに併用でき、`--output-dir` も指定できます。別処理（safe-share、stats、月次・週次サマリー、import、dry-run）、本文引数、`--memo`、`--date` との併用は拒否します。`--help` / `-h` では両オプションの依存・組み合わせ検証を省略してhelpを表示します。両オプション未指定時の引数処理は維持します。

Ollama用の入力生成・プレビュー・通信の処理順:

1. 引数を解析・検証し、通常の `--advice` と共通の処理で直近3件のログを古い日付から読み込む。ログがない場合は既存の `No logs found for advice` エラーを維持する。
2. 通常送信とプレビューで共通の `AdviceInput` を生成する。上記のとおり、`--sanitize-advice` 指定時だけ本文のコピーをマスクし、`buildAdviceInput` がログ・件数・質問・`sanitized` をまとめる。
3. `--preview-advice` 指定時は、共通定数のモデル名と入力を `buildOllamaAdviceRequest` に渡す。この関数は通信せず、system/userメッセージ、生成設定、出力JSON Schemaを含むリクエスト本文全体を構築する。userメッセージの `content` は `JSON.stringify(input)` による文字列とする。
4. プレビューは `JSON.stringify(request, null, 2)` を `runCli` の `advicePreviewContent` に返し、`adviceContent` は `null` とする。CLIはJSONのみをstdoutへ出力して終了し、provider生成・呼び出し・fetchは行わない。ログやディレクトリへの書き込みも行わない。
5. プレビュー未指定時は、注入されたproviderまたは `createOllamaAdviceProvider` を利用する。通常のOllama providerも同じ `buildOllamaAdviceRequest` とモデル定数を使い、構築した本文をJSON化してfetchで送信する。生成結果は従来どおり `adviceContent` に返す。

AIなしの `--advice` は、このOllama用分岐を通らず、従来どおり `formatAdviceInput` でログと質問を表示する。プレビューは実行時点の送信予定内容の確認であり、後続の通常実行ではログを再読み込みするため、確認済み内容を固定して送る保証は持たない。

Ollama応答は `parseAdviceOutput` でJSONの構造と型を確認した後、`validateAdviceEvidenceDates` で日付の整合性を検証します。`recordedStatements` と `selfEvaluations` の各 `date` は入力の `logs` に存在する必要があります。同日付の複数記述と空配列は許可します。不一致のエラーには項目名・配列インデックス・対象日付を含めます。`repeatedPatterns` の各 `evidenceDates` は入力ログに存在する重複のない2日以上を必要とし、`repeatedPatterns` 自体は空配列を許可します。検証は入力・出力オブジェクトを変更しません。日付が整合していても記述内容そのものの根拠を保証するものではなく、内容の根拠確認は未実装です。

自己評価は、本人による自分の能力・性質・行動などへの評価と定義します。他者の気持ちの推測は `selfEvaluations` から除外し、推測表現を保って `recordedStatements` に残すよう指示しています。例えば「嫌われた気がする」は他者の気持ちの推測、「自分は会話が下手だと思った」は自己評価です。`recordedStatements` と `selfEvaluations` の両配列への同じ記述の重複自体は禁止しません。

`repeatedPatterns` では記載された行動・希望・目的を区別し、要約を列挙した各根拠日の本文で裏付けられる共通内容に限定するよう指示しています。単日の希望・目的を他日の実施済み行動や複数日の傾向へ広げません。根拠のある繰り返しは拾い、共通内容を確保できない場合は空配列にするよう指示しています。

これらはモデルへの指示であり、分類・要約の意味をCLIが自動検証するものではありません。指示文の包含テストやモック応答は、生成品質の改善を実証しません。変更後の実生成による品質・再現性の再評価は未実施です。

### `--mirror-stats` / `--mirror-advice`

未実装です。

`mirror-logs` 自体の責務や形式がまだ確定していないため、現時点ではコード上の責務を持ちません。

## Quick Start の継続確認

明示的な `--output-dir` も、同じ一時ディレクトリ内の別の出力先で検証します。独立した作業ディレクトリから UTC 環境で起動し、指定先の `logs/YYYY-MM-DD.md` の JST 当日日付・見出し・本文と、作業ディレクトリに `logs` が作られないことを確認します。このケースも日付変更時の再試行と `finally` による削除の対象です。

`npm run test:smoke` は `scripts/quick-start-smoke.mjs` を実行します。既存の Vitest テストとは分け、CI ではビルド成功後に実行します。ビルド済み CLI を UTC 環境の別プロセスで2回起動し、一時ディレクトリに JST 当日の日付ファイル・見出し・本文が保存され、同日追記で両方のメモが残ることを確認します。`--date` は指定しません。

期待日付は実装を import せず `Asia/Tokyo` で求めます。実行前後の JST 日付が変わった場合のみ新しい一時ディレクトリで再試行し、最大3回で失敗します。子プロセスには10秒のタイムアウトを設け、各試行の一時ディレクトリは `finally` で削除します。外部通信・Ollama は不要です。README 全体の自動照合や clone・依存導入のスモークテストではありません。

## 将来の拡張方針

無理に一度に多機能化せず、現在の実装を土台に段階的に広げます。

1. ログ読み出し処理の整理・共通化
2. `--advice` の振り返り質問とOllamaによる助言の品質を改善する
3. 実装済みの AI 助言生成の入力・出力設計を見直し、再現性の検証を進める
4. `mirror-logs` の責務と形式を定義する
5. 必要に応じて `--mirror-stats` / `--mirror-advice` を設計する
