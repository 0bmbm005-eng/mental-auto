# status.md

`mental-auto` の現状を、実装・未実装・構想の境界が混ざらないように整理するためのステータス一覧です。

same-day append、stats、advice、任意マスクの記載は、2026-10-18 に `README.md`、`src/index.ts`、`test/index.test.ts` と照合しました。未実装のものは未実装として明記します。

## 1. 現在実装済み機能

- JST 基準で当日日付を `YYYY-MM-DD` 形式で決める
- `logs/YYYY-MM-DD.md` に Markdown ログを保存する
- `logs/` ディレクトリを自動作成する
- `--date YYYY-MM-DD` で対象日を指定する
- `--memo TEXT` で本文を 1 引数として渡す
- `--output-dir PATH` で出力先ベースディレクトリを切り替える
- `--import-mobile FILE_OR_DIR` で mobile inbox Markdown を対応日ログへ取り込む
- `--dry-run` で import 予定だけを表示する
- `--help`, `-h` でヘルプを表示する
- 空メモ時に `_No memo provided_` を書く
- `npm run doctor` でローカル実行状態を点検する
- `--safe-share` で共有前の最低限マスク済みテキストを stdout に出す
- same-day append で既存ログを保持し、タイムスタンプ見出し付きのエントリを末尾に追記する
- `--stats` でログの記録状況や月ごとの傾向を集計して stdout に表示する（元ログは変更しない）
- 通常の `--advice` で直近3件の日次ログを古い日付から順に読み、ログ内容と振り返り質問を表示する（AI不要）
- `--advice --advice-provider ollama` でローカルOllamaによる助言を生成し、JSONを stdout に表示する（元ログには書き込まない）
- `--sanitize-advice` でOllama送信前の任意マスクを適用する

`--sanitize-advice` は `--advice --advice-provider ollama` と併用し、送信するログ本文のコピーだけにメールアドレス・APIキーらしき文字列・ローカルパスのマスクを適用します。長文省略・空白整理・改行変換は行わず、日付・順序・元ログを保持します。未指定時は本文を加工しません。`sanitized: true` は限定的なマスク適用済みを意味し、人名・会社名・住所・電話番号などを含む完全な匿名化や、すべての秘密情報の検出を保証しません。パスなどの一致範囲が周辺の記述を巻き込む場合もあります。

Ollama応答はJSONの構造・型と日付の整合性を検証します。`recordedStatements` / `selfEvaluations` の各 `date` は入力ログに存在する必要があり、同日付の複数記述と空配列を許可します。`repeatedPatterns` の各 `evidenceDates` は入力ログに存在する重複のない2日以上が必要で、パターンの空配列は許可します。記述内容そのものがログに裏付けられているかは自動検証しません。品質・再現性の検証は今後の課題です。

## 2. 未実装機能

- `mirror-logs/` 生成
- `--mirror-stats`
- `--mirror-advice`

これらは現行実装では使えません。CLI に渡すと、オプション系は `Unknown option` で失敗します。

## 3. 実験中機能

Ollama連携は実装済みですが、生成内容の根拠・品質・再現性の検証は今後の課題です。実装済みであることは、助言の正確性や有用性の保証を意味しません。

## 4. 将来構想

- `logs` 読み出しの共通関数追加
- `mirror-logs` の責務定義
- AI助言の内容の根拠・品質・再現性の検証
- Ollama送信前のマスク対象拡張と送信前プレビューの検討

この段階では、いずれも構想または検討項目です。実装済み機能として扱わないでください。

## 5. 技術負債

- `src/index.ts` 1 ファイルに CLI パース、日付処理、整形、書き込みが集まっている
- `logs` 読み出しと mobile import が `src/index.ts` に集まっている
- mobile import の重複検知は履歴導入後のみ。ログ保存後・履歴保存前の失敗では再実行時に重複が残り得る
- `mirror-logs` の責務が未定義
- AI助言の記述内容の根拠を自動検証する処理は未実装
- README のセットアップ例を CI 相当で定期確認する仕組みがない

## 6. 安定機能

ここでいう「安定」は、少なくとも README、`--help`、実装、テストの間で解釈が一致している機能です。

- JST 固定の日付決定
- 1 日 1 ファイルの Markdown 出力
- `--date`
- `--memo`
- `--output-dir`
- `--help`, `-h`
- 空メモ時の `_No memo provided_`
- 同日再実行時の既存内容保持と追記

## 7. 破壊的変更予定がある箇所

現時点で確定した破壊的変更予定はありません。

ただし、次の項目は将来変更されると運用影響が大きいです。

- 同日再実行時の既存内容保持と追記挙動
- `logs` と `mirror-logs` の責務分担
- `--stats` / `--advice` 系の入出力仕様

same-day append の既存内容保持・追記仕様を変更する場合は、README / `--help` / docs / テストの同時更新が必要です。

## 8. 今後優先度が高い作業

- `logs` 読み出しの共通関数を追加する
- README のセットアップを CI 相当で定期確認できるようにする
- AI助言の内容の根拠・品質・再現性を検証する
- Ollama送信前のマスク対象拡張と送信前プレビューの必要性を検討する
- `mirror-logs` の存在意義を定義する

## 参照先

- [README.md](README.md)
- [AGENTS.md](AGENTS.md)
- [src/index.ts](src/index.ts)
- [docs/design.md](docs/design.md)
- [docs/tasks.md](docs/tasks.md)
- [docs/mental-auto-spec.md](docs/mental-auto-spec.md)
