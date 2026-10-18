# mental-auto User Guide

## mental-autoとは何か

`mental-auto` は、日々の短いメモを 1 日 1 ファイルの Markdown ログとして記録し、蓄積したログを集計・振り返りに活用するための CLI ツールです。

現在は、日次ログの保存と同日追記を基本として、mobile inbox の取り込み、月次・週次サマリー、ログ統計、直近3件のログの振り返りやOllamaによる助言生成などが利用できます。

通常の `--advice` はAIなしで直近3件の日次ログと振り返り質問を表示します。`--advice-provider ollama` を追加するとAIによる助言を生成できます。`--sanitize-advice` による送信前の任意マスクも実装済みです。`mirror` 関連機能は未実装です。

## 何ができるか

- その日のメモを Markdown で保存できる
- 同じ日に複数回実行すると、既存ログを残したまま新しいメモを追記できる
- 日付を指定して過去日のログも作れる
- 保存先ディレクトリを変えられる
- メモを通常引数でも `--memo` でも渡せる
- `mobile-inbox` の Markdown を対応日ログへ取り込める
- AI 共有前に最低限マスク済みテキストへ整形できる
- 月次・週次サマリーを生成できる
- `--stats` でログの記録状況や月ごとの傾向を確認できる
- `--advice` で直近3件の日次ログと振り返り質問を表示できる
- Ollama連携による助言生成と、送信前の任意マスクを利用できる


## インストール方法

### 前提

- Node.js
- npm

### セットアップ

```bash
git clone https://github.com/0bmbm005-eng/mental-auto.git
cd mental-auto
npm install
```

`package.json` は `private: true` なので、一般向け npm パッケージとしての配布前提ではありません。まずはリポジトリを clone して使う前提です。

## build方法

```bash
npm run build
```

このコマンドで `src/index.ts` が `dist/index.js` にコンパイルされます。

## 実行方法

もっとも基本的な実行方法です。

```bash
node dist/index.js 今日は少し疲れた
```

実行すると、カレントディレクトリの `logs/` 配下に当日ファイルが作られます。

例:

```text
logs/2026-03-26.md
```

### 日付を指定して実行

```bash
node dist/index.js --date 2026-03-26 今日は少し疲れた
```

### 出力先を変える

```bash
node dist/index.js --date 2026-03-26 --output-dir ./tmp 今日は少し疲れた
```

この場合の出力先は `./tmp/2026-03-26.md` ではなく、`./tmp/logs/2026-03-26.md` です。

### `--memo` を使う

```bash
node dist/index.js --memo "今日は気分が重い"
```

`--memo` を使うと、その値だけが本文になります。通常引数を後ろに書いても本文へは追加されません。

### `--safe-share` を使う

```bash
node dist/index.js --safe-share "mail=user@example.com path=/Users/example/mental-auto/logs/2026-03-26.md"
node dist/index.js --safe-share logs/2026-03-26.md
```

`--safe-share` は共有用の stdout 出力です。メールアドレス、API key らしき文字列、ローカルパスを最低限マスクし、長すぎる行や不要空白も整理します。

### `--import-mobile` を使う

```bash
node dist/index.js --import-mobile mobile-inbox/2026-06-25.md
node dist/index.js --import-mobile mobile-inbox
```

`YYYY-MM-DD.md` という名前の Markdown を対応する `logs/YYYY-MM-DD.md` に取り込みます。ログ内では `## Mobile notes` の下へ追加され、元ファイルは `archive/` へ移動します。

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

### `--dry-run` を使う

```bash
node dist/index.js --import-mobile mobile-inbox --dry-run
```

読み取り予定、追記予定、archive 移動予定だけを確認できます。書き換えはしません。

## 毎日の使い方

1. その日のメモを書く
2. `node dist/index.js 今日のメモ...` を実行する
3. `logs/YYYY-MM-DD.md` ができたことを確認する
4. 同じ日に追加でメモしたい場合は、もう一度 CLI を実行する

注意:

- 同じ日付で再実行すると、既存ログを保持したまま新しいメモが追記されます
- 追記されたメモには `## Entry YYYY-MM-DD HH:mm:ss JST` 形式の見出しが付きます
- 1 日 1 ファイルの構成を維持したまま、同日に複数回メモを残せます

## よく使うコマンド

```bash
npm run build

npm test

node dist/index.js 今日は少し疲れた

node dist/index.js --date 2026-03-26 今日は少し疲れた

node dist/index.js --memo "専用メモ"

node dist/index.js --output-dir ./tmp 今日は少し疲れた

node dist/index.js --monthly-summary

node dist/index.js --weekly-summary

node dist/index.js --stats

node dist/index.js --advice

node dist/index.js --help
```

## ログの見方

ログはとてもシンプルです。

```md
# 2026-03-26

今日は少し疲れた
```

読み方:

- 1 行目: ログの日付
- 空行: 見やすさのための区切り
- 3 行目以降: その日のメモ本文

メモを空で実行すると、本文は `_No memo provided_` になります。

## mirrorの見方

現時点では `mirror` 機能はありません。

- mirror JSON は生成されません
- mirror 用コマンドもありません
- mirror を読むための仕様も未定義です

## statsの見方

`--stats` を使うと、蓄積した日次ログの記録状況や継続状況を確認できます。

```bash
node dist/index.js --stats
```

主に次の情報が表示されます。

- ログファイル数とエントリ数
- 最新ログと最古ログ
- 現在の連続記録日数と最長連続記録日数
- 最新ログからの経過日数
- 1ログ日あたりの平均エントリ数
- 1日の最大エントリ数と最も活動的な日
- 今月・先月のログ日数や月ごとの記録傾向

`--stats` はログを読み取って集計する機能で、ログファイルそのものは変更しません。

## adviceの見方

- 直近3件の日次ログ（3件未満なら存在する分）を古い日付から順に読み込みます
- 通常の `--advice` はAIを使わず、ログ内容と振り返り質問を stdout に表示します
- `--advice --advice-provider ollama` はローカルOllamaで助言を生成し、JSONを stdout に表示します
- 接続先は `http://127.0.0.1:11434/api/chat`、モデルは `qwen3.5:9b` です。Ollamaの起動とモデルの取得が必要です
- 元ログは変更せず、生成した助言のファイル保存は行いません
- ログが存在しない場合は `No logs found for advice` エラーになります

```bash
node dist/index.js --advice
node dist/index.js --advice --advice-provider ollama
node dist/index.js --advice --advice-provider ollama --sanitize-advice
```

`--sanitize-advice` は `--advice --advice-provider ollama` と併用し、送信するログ本文のコピーだけにメールアドレス・APIキーらしき文字列・ローカルパスのマスクを適用します。長文省略・空白整理・改行変換は行わず、日付・順序・元ログを保持します。未指定時は本文を加工しません。`sanitized: true` は限定的なマスク適用済みを意味し、人名・会社名・住所・電話番号などを含む完全な匿名化や、すべての秘密情報の検出を保証しません。パスなどの一致範囲が周辺の記述を巻き込む場合もあります。

`--sanitize-advice` は `--output-dir` と併用できますが、`--safe-share`、`--stats`、月次・週次サマリー、import、dry-run、本文引数、`--memo`、`--date` との併用はエラーになります。`--help` / `-h` は表示できます。`--safe-share` は別経路で、Ollama送信時には自動適用されません。

Ollama応答はJSONの構造・型と日付の整合性を検証します。`recordedStatements` / `selfEvaluations` の各 `date` は入力ログに存在する必要があり、同日付の複数記述と空配列を許可します。`repeatedPatterns` の各 `evidenceDates` は入力ログに存在する重複のない2日以上が必要で、パターンの空配列は許可します。記述内容そのものがログに裏付けられているかは自動検証しません。品質・再現性の検証は今後の課題です。

## よくあるエラー


### `mental-auto failed: Invalid value for --date: ...`

原因:

- 日付が `YYYY-MM-DD` 形式でない
- 存在しない日付を指定している

例:

```bash
node dist/index.js --date 2026-13-01
```

### `mental-auto failed: Unknown option: ...`

原因:

- 実装されていないオプションを指定している

例:

```bash
node dist/index.js --mirror-stats
```

### `Missing value for --date`

原因:

- `--date` のあとに値がない

### `Missing value for --memo`

原因:

- `--memo` のあとに本文がない

### `Missing value for --output-dir`

原因:

- `--output-dir` のあとにパスがない

## トラブルシューティング

### `node dist/index.js` が動かない

確認すること:

- `npm install` を実行したか
- `npm run build` を実行したか
- `dist/index.js` が生成されているか

### ログが見つからない

確認すること:

- 実行した場所がどこか
- `--output-dir` を付けていないか
- 実際の出力先が `logs/` 配下であること


## おすすめ運用方法

- 毎日の短いメモを日次ログとして残す
- 同じ日に追加で記録したい場合は、CLI を再実行して既存ログへ追記する
- `--stats` を使って、記録状況や継続状況を振り返る
- `--advice` を使って、直近3件の日次ログを読み返す
- `logs/` に個人情報や強い機微情報を書きすぎない
- Git にログを含めるかどうかを先に決める
- `dist/` と `logs/` の Git 管理方針を明確にする

## 現時点でまだできないこと

- AI助言の記述内容がログに裏付けられているかの自動検証
- 生成した助言のファイル保存
- 人名などを含む完全な匿名化
- mirror JSON 生成
- mirror advice

## 変更理由

- 初見の利用者でも、現時点で本当に使える範囲だけを迷わず試せるようにするため
- 未実装機能を先に明記し、期待値のズレを減らすため
