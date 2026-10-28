# mental-auto

mental-auto is a CLI that helps you capture daily notes and reflect on them.
It saves daily logs locally as Markdown files using Japan Standard Time (JST) dates.
Weekly and monthly summaries, along with log statistics, are available.
Local AI advice through Ollama is optional.

mental-auto は、日々の短いメモを JST（日本標準時）基準の日付ごとの Markdown ファイルとしてローカルに蓄積する CLI ツールです。

将来的には、AI の知識・視点を活用しながら、記録を振り返り、感情と向き合い、その経験から学び、自分自身で受け止め方を選べるようになることを目指したプロジェクトです。

> **現在の開発状況**
>
> 現在は、日次ログを安全かつ継続的に蓄積する基盤の構築を中心に開発しています。`--advice --advice-provider ollama` で、OllamaによるローカルAIの振り返り生成を利用できます。`--mirror-stats`、`--mirror-advice`、`mirror-logs` 生成は未実装です。

## 目次

- こんな人向け
- できること
- Quick Start
- 未実装の機能
- 最短運用
- CLI コマンド一覧
- CLI オプション仕様
- ログ仕様
- same-day append 仕様
- `--stats` / `--advice` など
- 典型的なエラー
- リポジトリの見方

## こんな人向け

- 日々の出来事や感情を記録し、感情との向き合い方を身につけたい人
- 日々の短いメモを、サービスに依存せずローカルに残したい人
- メンタル、睡眠、行動、読書などの日々の記録を日付単位の Markdown に残したい人
- 外出先で書いた Markdown メモを、あとで日次ログに集約したい人

## できること

- 今日の出来事を1コマンドで記録できる
- 過去の日付の出来事も記録できる
- 外出先のメモをあとから取り込める
- 共有前に個人情報を簡単にマスクできる
- 指定した月の日次ログを1つの月次サマリーにまとめられる
- `--advice` で直近3件のログ内容を確認できる

## Quick Start

前提:

- Node.js 20 以上を推奨
- npm

```bash
git clone https://github.com/0bmbm005-eng/mental-auto.git
cd mental-auto
npm install
npm run build
node dist/index.js "今日は少し疲れた"
```

実行すると、その日の JST 日付に対応する `logs/YYYY-MM-DD.md` が作成され、渡したメモが保存されます。

初回確認:

```bash
cat logs/$(TZ=Asia/Tokyo date +%F).md
```

動作を詳しく確認する場合:

```bash
npm test
npm run doctor
```

ビルド済み CLI の保存・同日追記・`--output-dir` を一時ディレクトリで確認する場合:

```bash
npm run build
npm run test:smoke
```

CI でもビルド後に実行します。`--date` を指定せず JST 当日の日付・見出し・本文と同日追記を検証し、一時ディレクトリは成功・失敗時とも削除します。外部通信や Ollama は不要です。

## 未実装の機能

現時点では以下は未実装です。指定すると失敗します。

- `--mirror-stats`
- `--mirror-advice`
- `mirror-logs` 生成

## 最短運用

当日分を保存:

```bash
node dist/index.js "今日は少し疲れた"
```

日付を指定して保存:

```bash
node dist/index.js --date 2026-03-26 "今日は少し疲れた"
```

出力先を切り替えて保存:

```bash
node dist/index.js --date 2026-03-26 --output-dir ./tmp "今日は少し疲れた"
```

`--memo` を使って 1 引数で本文を渡す:

```bash
node dist/index.js --memo "今日は気分が重い"
```

共有前にテキストを安全化:

```bash
node dist/index.js --safe-share "contact me at foo@example.com path=/Users/example/projects/mental-auto/logs/2026-03-26.md"
```
直近3件のログを表示:

```bash
node dist/index.js --advice
```

既存ログを共有前に安全化:

```bash
node dist/index.js --safe-share logs/2026-03-26.md
```

ヘルプ表示:

```bash
node dist/index.js --help
```

月次サマリーを作成:

```bash
npm start -- --monthly-summary
npm start -- --monthly-summary 2026-07
```

`--monthly-summary` は、指定月の `logs/YYYY-MM-DD.md` を日付順に読み込み、
`monthly-summary/YYYY-MM.md` を生成します。月を省略した場合は JST 基準の現在月を使います。
既存のサマリーは上書きされ、`monthly-summary/` がない場合は自動作成されます。
対象月にログがない場合も、空月用のサマリーを生成します。元の日次ログは変更しません。

週次サマリーを作成:

```bash
npm start -- --weekly-summary
npm start -- --weekly-summary 2026-W13
```

`--weekly-summary` は、指定週（ISO 8601 の `YYYY-Www`、月曜始まり）の
`logs/YYYY-MM-DD.md` を日付順に読み込み、`weekly-summary/YYYY-Www.md` を生成します。
週を省略した場合は JST 基準の現在週を使います。既存のサマリーは上書きされ、
`weekly-summary/` がない場合は自動作成されます。対象週にログがない場合も、
空週用のサマリーを生成します。元の日次ログは変更しません。

## CLI コマンド一覧

### npm scripts

```bash
npm install
npm run build
npm run doctor
npm test
npm run dev -- "今日は少し疲れた"
npm start -- --date 2026-03-26 "今日は少し疲れた"
```

意味:

- `npm install`: 依存関係を入れる
- `npm run build`: `src/index.ts` を `dist/index.js` にビルドする
- `npm run doctor`: ローカル実行状態の基本点検を行う
- `npm test`: Vitest を実行する
- `npm run dev -- ...`: `tsx` で TypeScript を直接実行する
- `npm start -- ...`: ビルド済み CLI を起動する

### `npm run doctor`

ローカル運用前提の簡易診断コマンドです。最低限、次を確認します。

- Node.js version
- `package.json` の存在
- `dist/` の存在
- `logs/` の存在
- `tsconfig.json` の存在
- build 済みか
- `logs/` 配下に書き込めるか

表示例:

```text
mental-auto doctor

[OK] Node.js version: v24.1.0 (recommended: 20+)
[OK] package.json: /path/to/mental-auto/package.json
[OK] dist/: /path/to/mental-auto/dist
[OK] logs/: /path/to/mental-auto/logs
[OK] tsconfig.json: /path/to/mental-auto/tsconfig.json
[OK] Build status: /path/to/mental-auto/dist/index.js is present
[OK] Write permission: write probe succeeded in /path/to/mental-auto/logs
```

補足:

- `ERROR` が 1 件でもあると終了コードは `1` です
- `WARN` は注意喚起で、終了コードは `0` のままです
- write 権限確認では一時ファイルを作ってすぐ削除します

### 実行形式

```bash
node dist/index.js "今日は少し疲れた"
npx tsx src/index.ts "今日は少し疲れた"
```

`package.json` の `bin` には `mental-auto` が定義されていますが、このリポジトリは `private: true` です。現状は clone して使う前提です。

## CLI オプション仕様

### `--import-mobile FILE_OR_DIR`

- ファイルまたはディレクトリを指定して mobile-inbox の Markdown を取り込みます
- `logs/YYYY-MM-DD.md` の `## Mobile notes` へ追記します
- `--dry-run` と組み合わせると予定のみ表示します

例:

```bash
node dist/index.js --import-mobile mobile-inbox
node dist/index.js --import-mobile mobile-inbox --dry-run
```

#### mobile import の重複検知

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

### `--date YYYY-MM-DD`

- JST 基準の日付文字列を指定します
- `YYYY-MM-DD` 形式かつ実在日付である必要があります
- 不正値は `mental-auto failed: Invalid value for --date: ...` で失敗します

例:

```bash
node dist/index.js --date 2026-03-26 "記録したいこと"
```

### `--memo TEXT`

- 本文を 1 引数で渡します
- `--memo` を使った場合、通常引数は本文に追加されません

例:

```bash
node dist/index.js --memo "専用メモ"
```

### `--output-dir PATH`

- 出力先ベースディレクトリを切り替えます
- 実際の出力先は `PATH/logs/YYYY-MM-DD.md` です

例:

```bash
node dist/index.js --output-dir ./tmp "退避メモ"
```

### `--help`, `-h`

- ヘルプを表示して終了します
- ファイルは書き込みません

### `--safe-share INPUT`

- 共有前の最低限マスクと整形を行い、stdout に出します
- `INPUT` が既存ファイルならその内容を読みます
- 既存ファイルでなければ、そのまま文字列として扱います
- 外部通信は行いません

最低限行うこと:

- メールアドレス mask
- API key らしき文字列 mask
- ローカルパス mask
- 長すぎる行の省略
- 不要空白整理

例:

```bash
node dist/index.js --safe-share "mail=user@example.com token=sk-1234567890abcdef1234567890 path=/Users/example/projects/mental-auto/logs/2026-03-26.md"
node dist/index.js --safe-share logs/2026-03-26.md
```

### `--monthly-summary [YYYY-MM]`

- 指定月の `logs/YYYY-MM-DD.md` を日付の昇順でまとめます
- 出力先は `monthly-summary/YYYY-MM.md` です
- 月を省略すると JST 基準の現在月を使います
- 既存の月次サマリーは上書きします
- 対象月にログがなくても正常終了し、空月用のファイルを生成します

例:

```bash
npm start -- --monthly-summary
npm start -- --monthly-summary 2026-07
```

### `--weekly-summary [YYYY-Www]`

- 指定週の `logs/YYYY-MM-DD.md` を日付の昇順でまとめます
- 出力先は `weekly-summary/YYYY-Www.md` です
- 週を省略すると JST 基準の現在週（ISO 8601、月曜始まり）を使います
- 既存の週次サマリーは上書きします
- 対象週にログがなくても正常終了し、空週用のファイルを生成します

例:

```bash
npm start -- --weekly-summary
npm start -- --weekly-summary 2026-W13
```

補足:

- 過剰な匿名化はしません
- 共有向け整形なので、元ファイルは変更しません
- 出力先は常に stdout です

## ログ仕様

### `logs/`

- 実装済み
- デフォルト出力先
- 1 日 1 ファイル
- パス形式: `logs/YYYY-MM-DD.md`

出力例:

```md
# 2026-03-26

今日は少し疲れた
```

空本文のとき:

```md
# 2026-03-26

_No memo provided_
```

### `mirror-logs/`

- 未実装
- 現行コードでは生成しません
- ディレクトリ名、JSON 形式、更新契機、保存粒度はいずれも未定義です

誤読防止のため、現時点では「存在しない仕様」として扱ってください。

## same-day append 仕様

同じ日付のログがすでに存在する場合、新しいメモは既存ファイルの末尾に追記されます。

- 同じ日付で再実行しても既存 `logs/YYYY-MM-DD.md` は上書きしません
- 既存内容を保持したまま、新しいエントリを末尾に追加します
- 追記エントリには `## Entry YYYY-MM-DD HH:mm:ss JST` 形式のタイムスタンプ見出しが付きます
- `--date YYYY-MM-DD` を指定した場合も、その日付のファイルに同じルールで追記します

例:

```bash
node dist/index.js "朝のメモ"
node dist/index.js "夜のメモ"
```

出力例:

```md
# 2026-03-26

朝のメモ

## Entry 2026-03-26 21:15:30 JST

夜のメモ
```
## `--advice`

`--advice` は直近3件の日次ログを読み込み、古い日付から順に表示します。
ログの後には、変化、繰り返している感情やパターン、次の小さな行動を振り返るための質問を表示します。

```bash
node dist/index.js --advice
```

### Ollamaで振り返りを生成する

`--advice-provider ollama` を追加すると、直近3件のログをローカルのOllamaに渡して、AIによる振り返りを生成します。

前提:

- Ollamaが起動していること
- モデル `qwen3.5:9b` が取得済みであること

```bash
node dist/index.js --advice --advice-provider ollama
```

接続先は `http://127.0.0.1:11434/api/chat`、使用モデルは `qwen3.5:9b` です。
この設定では、ログを端末内のOllamaへ送信します。

送信前に限定的なマスクを適用する場合:

```bash
node dist/index.js --advice --advice-provider ollama --sanitize-advice
node dist/index.js --advice --advice-provider ollama --sanitize-advice --output-dir ./tmp
```

`--sanitize-advice` は、送信するログ本文のコピーにだけ、既存のメールアドレス・APIキーらしき文字列・ローカルパスのマスクを適用します。長文の省略、空白整理、改行変換は行わず、日付・順序・元ログを保持します。未指定時は本文を加工しません。

AI入力の `sanitized: true` は、この限定的なマスク処理の適用済みを意味します。人名・会社名・住所・電話番号などを含む完全な匿名化ではなく、すべての秘密情報を検出するものでもありません。パスなどの一致範囲が周辺の記述を巻き込む場合もあります。

`--sanitize-advice` と後述の `--preview-advice` は、どちらも `--advice --advice-provider ollama` が必須です。`--output-dir` と併用できますが、`--safe-share`、`--stats`、`--monthly-summary`、`--weekly-summary`、`--import-mobile`、`--dry-run`、本文引数、`--memo`、`--date` との併用はエラーになります。`--help` / `-h` は表示できます。既存の `--safe-share` は別経路で、従来どおり整形と長文省略も行います。

生成結果はJSON形式で標準出力（stdout）に表示します。主な出力項目は次のとおりです。

- `recordedStatements`: ログに明記された内容を、日付（`date`）と記述（`statement`）の組で示す配列です。
- `selfEvaluations`: 本人がログに明記した自己評価を、日付（`date`）と記述（`statement`）の組で示す配列です。
- `repeatedPatterns`: 複数の日付で確認できる繰り返しパターンを、要約（`summary`）と根拠のある日付（`evidenceDates`）で示す配列です。
- `ruminationNotice`: 反芻についての注意を示す文章です。モデルには、反芻を診断・断定せず、追加の反省・分析・作業継続を促さないよう指示しています。
- `nextAction`: 休息や注意の切り替えを含む小さな行動の中から、次の行動を1つ提案する文章です。

モデルには、ログに明記された内容と推測・解釈を区別し、推測を記録された事実として扱わないよう指示しています。`recordedStatements`、`selfEvaluations`、`repeatedPatterns` は、根拠がない場合は空配列にするよう指示しています。CLIはJSONの構造・型に加え、`recordedStatements` と `selfEvaluations` の各 `date` が入力ログに存在することを検証します。同じ日付の複数記述と空配列は許可します。`repeatedPatterns` の各 `evidenceDates` は、入力ログに存在する重複のない2日以上である必要があります（`repeatedPatterns` 自体は空配列を許可）。不整合は例外として処理し、入力・出力オブジェクトは変更しません。これは日付の整合性の検証であり、記述内容そのものがログに裏付けられているかは自動検証しません。

接続に失敗した場合は、次のメッセージを標準エラーに表示し、終了コード `1` で終了します。

```text
mental-auto failed: Ollamaに接続できませんでした。Ollamaが起動しているか、接続先 http://127.0.0.1:11434/api/chat が正しいか確認してください。
```

`--advice-provider` を省略した場合は、AIを使わずログと振り返り質問を表示します。
`--advice-provider ollama` は `--advice` と一緒に指定する必要があります。

ログが存在しない場合は `No logs found for advice` で失敗します。

### `--preview-advice` で送信予定のJSONを確認する

`--advice --advice-provider ollama` に追加すると、通常実行と同じ直近3件のログを古い日付から読み込み、送信予定のリクエスト本文全体をJSONで表示して終了します。Ollamaへ通信せず、Ollamaの起動やモデルの取得も不要です。元ログやディレクトリは変更しません。

```bash
# マスクなしで確認
node dist/index.js --advice --advice-provider ollama --preview-advice

# 限定的なマスクを適用して確認
node dist/index.js --advice --advice-provider ollama --sanitize-advice --preview-advice

# ./tmp/logs を読み取って確認
node dist/index.js --advice --advice-provider ollama --sanitize-advice --preview-advice --output-dir ./tmp
```

正常時は説明文を混ぜず、2スペースで整形したJSONのみをstdoutへ出力します。JSONにはモデル名、`messages`、生成設定、出力JSON Schemaを含みます。`messages` 内の `role: "user"` の `content` は、ログや振り返り質問などを含むAI入力をJSON化した文字列です。外側のJSONを解析した後、この文字列もJSONとして解析できます。

`--sanitize-advice` は自動適用されません。指定時のマスク対象と限界は上記のとおりで、完全な匿名化ではありません。プレビュー出力には個人情報や秘密情報が含まれる可能性があるため、ターミナルの記録、コピーした内容、リダイレクト先ファイルの取り扱いに注意してください。

プレビュー後に `--preview-advice` を外して通常実行すると、ログを再読み込みします。その間にログが追加・編集・削除されると、選ばれるログや送信内容が変わる可能性があります。確認したJSONを保存してそのまま送信する機能ではありません。

## `--stats`

`--stats` と `--advice` は、`logs/` 直下の `YYYY-MM-DD.md` 形式かつ実在する日付の通常ファイルだけを対象にします。その他の Markdown、不正な日付、異なる拡張子、ディレクトリは無視します。

`--stats` は保存されているログを集計し、記録状況や月ごとの傾向を表示します。

例:

```bash
node dist/index.js --stats
```

## `--mirror-stats` / `--mirror-advice`

現時点では未実装です。

指定すると未知のオプションとして失敗します。

```bash
node dist/index.js --mirror-stats
node dist/index.js --mirror-advice
```
## 典型的なエラー
代表的なエラーの例です。

### 不正な日付

```bash
node dist/index.js --date 2026-13-01
```

### 未知オプション

```bash
node dist/index.js --mirror-stats
```

### 値不足

```bash
node dist/index.js --date
node dist/index.js --memo
node dist/index.js --output-dir
```


## リポジトリの見方

- [src/index.ts](src/index.ts): CLI 本体
- [test/index.test.ts](test/index.test.ts): 振る舞いの最小テスト
- [docs/mental-auto-spec.md](docs/mental-auto-spec.md): 実装準拠の仕様メモ
- [docs/mental-auto-user-guide.md](docs/mental-auto-user-guide.md): 利用者向け補足
- [docs/design.md](docs/design.md): 設計意図と未実装境界
- [docs/tasks.md](docs/tasks.md): 今後の TODO
- [AGENTS.md](AGENTS.md): 将来の作業者向けガイド

## 開発時の生成ファイル確認

開発用の clone ごとに、依存導入後、一度だけコミット前チェックを有効にします（Node.js 22、Git、npm が必要）。

```bash
npm ci
npm run hooks:install
```

既に独自の `core.hooksPath` を設定している場合は、この設定を上書きせず、既存の pre-commit から `node scripts/check-generated.mjs` を呼び出してください。

フックはステージ済みの空白エラーを検査し、ステージ済みソースを一時ディレクトリでコンパイルして、Git管理対象の `dist/` と照合します。作業ツリーの変更や自動ステージは行いません。未ステージの修正ではコミット内容の不一致を解消できません。

不一致の場合は次を実行し、対応するソースと生成ファイルを一緒にステージして再試行します。

```bash
npm run build
git diff -- dist/index.js
git add src/index.ts dist/index.js
npm run check:generated
```

他のソースを変更した場合は、そのファイルもステージしてください。手動確認の `npm run check:generated` もステージ済み内容を検査します。新規 clone やフックを無効化した環境では自動実行されないため、CI の生成差分検査も継続します。
