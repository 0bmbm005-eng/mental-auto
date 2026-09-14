# mental-auto Specification

## プロジェクト概要

`mental-auto` は、日次メモを Markdown のログファイルとして記録・振り返りするための TypeScript 製 CLI ツールです。日次ログの保存と同日追記を基本とし、mobile inbox の取り込み、月次・週次サマリー、ログ統計、最新ログの読み出しなどの機能を備えています。

この文書は、現行の実装・README・テストから確認できる仕様を整理したものです。不明な点や未実装の機能は、そのまま「不明」「未実装」と記載します。

## 目的

- 日々のメモを一定形式の Markdown ログとして残す
- JST 基準の日付でログファイルを生成する
- 蓄積したログを集計・振り返りに活用する
- 将来の助言生成や自己振り返り機能へ拡張できる土台を保つ
- CLI として再利用できる最小構成を保つ

## 現在の機能一覧

- メモ文字列から日次ログ本文を生成する
- JST の当日日付を `YYYY-MM-DD` 形式で求める
- `--date` で対象日を明示指定する
- `--output-dir` で出力先のベースディレクトリを切り替える
- `--memo` でメモ本文を 1 引数として指定する
- `--import-mobile` で mobile inbox Markdown を対応日ログへ取り込む
- `--dry-run` で import 予定だけを表示する
- `--safe-share` で共有向けの最低限マスク済みテキストを stdout に出す
- `--help` / `-h` でヘルプを表示する
- `logs/` ディレクトリを自動作成してログを書き込む
- `npm run doctor` でローカル実行状態を点検する
- same-day append で同日の既存ログへ新しいエントリを追記する
- `--monthly-summary` で月次サマリーを生成する
- `--weekly-summary` で週次サマリーを生成する
- `--stats` でログの記録状況や月ごとの傾向を集計する
- `--advice` で最新の日次ログを読み込んで stdout に表示する

## CLIコマンド一覧

現行の `package.json` から確認できるコマンドは以下です。

- `npm run dev`
  - `tsx src/index.ts` を直接実行
- `npm run build`
  - `tsc -p tsconfig.json` で `src/index.ts` を `dist/index.js` にビルド
- `npm test`
  - `vitest run` を実行
- `npm run doctor`
  - `node dist/doctor.js` を実行
- `npm start`
  - `node dist/index.js` を実行
- `mental-auto`
  - `package.json` の `bin` で `./dist/index.js` に割り当て済み
  - ただし `private: true` のため、公開パッケージ前提の配布仕様は未整備

## 各オプション説明

### 通常実行

```bash
node dist/index.js 今日は少し疲れた
```

- 非オプション引数は空白区切りで連結され、メモ本文になります
- 出力先は実行ディレクトリ配下の `logs/YYYY-MM-DD.md` です

### `--date YYYY-MM-DD`

- ログの対象日を JST ベースの日付文字列で指定します
- 正規表現と `Date` による検証があり、不正値はエラーになります
- 例: `2026-13-01` は拒否されます

### `--output-dir PATH`

- 出力ベースディレクトリを切り替えます
- 実際の出力先は `PATH/logs/YYYY-MM-DD.md` です
- `PATH` は `resolve()` されるため絶対パス化されます

### `--memo TEXT`

- メモ本文を 1 引数で明示指定します
- `--memo` が指定されると、それ以降を含む通常引数は本文に追加されません
- 実装上は「通常引数より `--memo` を優先する」仕様です

### `--safe-share INPUT`

- 共有前の最低限マスク済みテキストを stdout に出します
- `INPUT` が既存ファイルならその内容を読みます
- 既存ファイルでなければ文字列として扱います
- 元ファイルは変更しません

### `--import-mobile FILE_OR_DIR`

- ファイル指定時はその 1 件を取り込みます
- ディレクトリ指定時は直下の `*.md` をファイル名順で処理します
- 採用するファイル名は `YYYY-MM-DD.md` のみです
- 本文から日付は読みません
- 対象ログは `logs/YYYY-MM-DD.md` です
- `## Mobile notes` セクションへ本文を追記します
- 取り込み後は同じディレクトリの `archive/` へ移動します

### `--dry-run`

- `--import-mobile` と一緒に使います
- 読み取り予定、追記予定、archive 移動予定のみ表示します
- ファイルの書き換えや移動は行いません

### `--help`, `-h`

- ヘルプ文を表示して終了します
- ファイル出力は行いません

### `--stats`

- `logs/` 配下の日次ログを読み取り、記録状況を集計して stdout に表示します
- ログファイル数とエントリ数を集計します
- 最新ログと最古ログの日付を表示します
- 現在の連続記録日数と最長連続記録日数を集計します
- 最新ログからの経過日数を集計します
- 1ログ日あたりの平均エントリ数を集計します
- 1日の最大エントリ数と最も活動的な日を集計します
- 今月・先月のログ日数や記録率など、月ごとの記録状況と傾向を集計します
- ログファイルそのものは変更しません

実行例:

```bash
node dist/index.js --stats
```
### `--monthly-summary [YYYY-MM]`

- 指定した月の日次ログをまとめて月次サマリーを生成します
- 月を省略した場合は現在月を対象にします
- 対象月のログを日付順にまとめます
- 対象ログがない場合は空月用の定型内容を生成します

### `--weekly-summary [YYYY-Www]`

- 指定した ISO 週の日次ログをまとめて週次サマリーを生成します
- 週を省略した場合は現在週を対象にします
- 月曜から日曜までを 1 週間として扱います
- 月跨ぎ・年跨ぎの週にも対応します

### `--advice`

- 最新の日次ログを特定して、その Markdown 内容を stdout に表示します
- 最新ログの特定には `getLogStats()` を使います
- ログが存在しない場合は `No logs found for advice` エラーになります
- 現在はログ内容の表示までで、AI による助言生成はまだ行いません

実行例:

```bash
node dist/index.js --advice
```

### 未実装・未対応オプション

以下は現行コードベースには存在せず、実行すると `Unknown option` エラーになります。

- `--mirror-stats`
- `--mirror-advice`

## 出力例

### コマンド

```bash
node dist/index.js --date 2026-03-26 今日は 少し 疲れた
```

### 標準出力

```text
Saved log: /absolute/path/logs/2026-03-26.md (2026-03-26)
```

### 生成ファイル

```md
# 2026-03-26

今日は 少し 疲れた
```

### 空メモ時

```md
# 2026-03-26

_No memo provided_
```

## ディレクトリ構成

現行コードベースで確認できる主な構成です。

```text
mental-auto/

├─ README.md
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ AGENTS.md
├─ src/
│  ├─ index.ts
│  ├─ doctor.ts
│  └─ safe-share.ts
├─ test/
│  ├─ index.test.ts
│  └─ doctor.test.ts
├─ dist/
│  ├─ index.js
│  └─ doctor.js
├─ logs/
│  └─ YYYY-MM-DD.md
├─ mobile-inbox/
│  ├─ YYYY-MM-DD.md
│  └─ archive/
└─ docs/
   ├─ design.md
   ├─ mental-auto-spec.md
   ├─ mental-auto-user-guide.md
   ├─ status.md
   └─ tasks.md
```

## ログ構造

ログは Markdown 1 ファイル 1 日構成です。

```md
# YYYY-MM-DD

<memo body or _No memo provided_>
```

仕様上のポイント:

- 先頭 1 行目は `# YYYY-MM-DD`
- 2 行目は空行
- 本文は `memo.trim()` 済み文字列
- 本文が空文字なら `_No memo provided_`
- 末尾に改行 1 つが入る

mobile import を行うと、同じログ内に次のセクションが追加または更新されます。

```md
## Mobile notes

<imported markdown body>
```

## ログ生成先

- デフォルト: `process.cwd()/logs/YYYY-MM-DD.md`
- `--output-dir PATH` 指定時: `resolve(PATH)/logs/YYYY-MM-DD.md`

## タイムゾーン処理

- タイムゾーン定数は `Asia/Tokyo`
- 日付自動決定は `Intl.DateTimeFormat(..., { timeZone: "Asia/Tokyo" })` を使用
- そのため、実行環境のローカルタイムゾーンに依存せず JST 日付でログ日付が決まります

## append仕様

same-day append は実装済みです。

- 同日のログファイルが存在しない場合は、新しい日次ログを作成します
- 同日の既存ログがある場合は、既存内容を保持したまま新しいメモを追記します
- 追記するメモには `## Entry YYYY-MM-DD HH:mm:ss JST` 形式の見出しを付けます
- 1 日 1 ファイルの構成を維持しながら、同日に複数回メモを残せます

## mirror JSON仕様

現行コードベースでは未実装です。

- `mirror JSON` を生成する関数・CLI オプション・型定義・テストは確認できませんでした
- `mirror-logs` 出力も未実装です
- JSON 構造も定義されていません

## exercise analyzer仕様

現行コードベースでは未実装です。

確認結果:

- exercise 判定処理なし
- analyzer モジュールなし
- exercise に関する CLI オプションなし
- exercise に関するテストなし

そのため、以下はすべて不明です。

- exercise 判定条件
- negation 処理
- cancellation 処理
- mixed ケースの扱い

## sauna analyzer仕様

現行コードベースでは未実装です。

確認結果:

- sauna 判定処理なし
- analyzer モジュールなし
- sauna に関する CLI オプションなし
- sauna に関するテストなし

そのため、以下はすべて不明です。

- sauna 判定条件
- negation 処理
- cancellation 処理
- mixed ケースの扱い

## advice生成仕様

`--advice` の第一段階は実装済みです。

現在の仕様:

- `--advice` を指定すると、`getLogStats()` を使って最新の日次ログを特定します
- 最新ログが存在する場合、その Markdown ファイルを読み込みます
- 読み込んだログ内容を `adviceContent` として返します
- 直接 CLI から実行した場合は、`adviceContent` を stdout に表示します
- ログが存在しない場合は `No logs found for advice` エラーになります
- 最新ログを正しく読み込む正常系テストがあります
- ログが存在しない場合のエラーテストがあります

現在は未実装:

- ログ内容を分析して advice を生成する処理
- LLM を利用した助言生成
- 複数日のログを使った振り返り
- 生成した advice の保存

現段階の `--advice` は、将来の振り返り・助言生成に向けて過去ログを読み出すための基盤機能です。

## mirror advice仕様

現行コードベースでは未実装です。

- `--mirror-advice` オプションなし
- mirror advice ロジックなし
- mirror advice 用テストなし

## CLIエントリ仕様

- メイン実装は `src/index.ts`
- ビルド成果物は `dist/index.js`
- `package.json` の `bin.mental-auto` は `./dist/index.js`
- 直接実行判定は `import.meta.url === pathToFileURL(process.argv[1]).href`

## build / test仕様

### `npm run build`

- TypeScript を `dist/` にコンパイルします
- `rootDir` は `src`
- `outDir` は `dist`
- 現行コードベースでビルド成功を確認

### `npm test`

- `vitest run` を使う最小構成です
- Vitest 設定ファイルはなく、デフォルト設定で実行されています
- 現行テストでは 2 ファイル 53 テスト成功を確認

## テスト構成

`test/index.test.ts` では、主に以下をテストしています。

- JST 基準の日付・週の計算
- 日次ログの Markdown 生成
- 空メモ時の `_No memo provided_`
- same-day append の追記処理
- `--date`、`--memo`、`--output-dir` の CLI 処理
- `--help` の表示内容
- mobile inbox の取り込み
- `--dry-run` の処理
- invalid mobile inbox filename の拒否
- 月次サマリーの生成
- 週次サマリーの生成
- `--stats` によるログ統計の集計
- 現在の連続記録日数と最長連続記録日数
- 最新ログ・最古ログと最新ログからの経過日数
- 平均エントリ数、1日の最大エントリ数、最も活動的な日
- 今月・先月のログ日数や月ごとの記録傾向
- `--advice` で最新の日次ログを読み込めること
- `--advice` でログが存在しない場合にエラーになること

`test/doctor.test.ts` では、`npm run doctor` に関するローカル実行状態の点検処理をテストしています。

## 回帰テスト対象

現行テストで回帰を検知できる主な範囲:

- JST 日付・週の計算
- ログ Markdown 形式
- 空メモ時の表示
- same-day append の追記処理
- ヘルプ出力の基本文言
- カスタム出力先への書き込み
- `--memo` 優先仕様
- 不正な `--date` の拒否
- mobile import の正常系
- mobile import の dry-run
- invalid mobile inbox filename の拒否
- 月次サマリーの生成
- 週次サマリーの生成
- `--stats` の各種集計
- `--advice` で最新ログを読み込めること
- `--advice` でログが存在しない場合にエラーになること

現行テストで未カバー、または今後追加確認できる範囲:

- 直接実行時の標準出力文言
- `--output-dir` 不正値時の挙動
- `--date` / `--memo` / `--output-dir` の値欠落エラー
- 未知オプションエラー
- README 記載コマンドとの整合


## 今後拡張しやすいポイント

- `parseArgs` を独立モジュール化するとオプション追加に強くなる
- ログ生成、ファイル保存、CLI 表示を分離すると機能追加しやすい
- `mirror` 機能や、今後拡張する `stats` / `advice` の処理を別モジュールへ分離しやすい構成にすると保守しやすい
- 出力を Markdown 以外にも広げるならデータモデル層が必要
- analyzer 系を実装するなら専用ユニットテスト群を `test/analyzers/` などへ分離しやすい

## 現時点の制限事項

- 1 ファイル構成で責務が集中している
- JSON 出力なし
- mirror 機能なし
- `--advice` は最新ログの読み出し・表示までで、AI による助言生成は未実装
- interactive モードなし
- exercise / sauna 判定なし
- README は現行 CLI オプションと未実装境界を説明している

## セキュリティ上の注意

- ログ本文はそのまま Markdown として保存されるため、個人情報や機微情報が平文で残る
- `logs/` 配下に実データがあり、現在の Git 管理状況では一部ログが追跡済み
- `dist/` も `.gitignore` 対象なのに追跡済みで、生成物差分が残りやすい
- 出力先に任意パスを指定できるため、誤って共有フォルダへ保存しない運用が必要

## 運用上の注意

- 同じ日付で再実行した場合は、既存ログを保持したまま新しいメモを追記する

## READMEと実装の整合

- README は現行の主要 CLI オプションと使用例を説明している
- same-day append の追記仕様を説明している
- `--stats` は実装済み機能として説明している
- `--advice` は最新の日次ログを読み込んで表示する第一段階の機能として説明している
- `--advice` による AI 助言生成は未実装であることを明記している
- `--mirror-stats`、`--mirror-advice` などの未実装機能は、実装済み機能と区別している

## 変更理由

- 実装と README のズレを減らし、現行コードで実際に使える機能だけを文書化するため
- 未実装機能を明示し、今後の改修時に「何がある前提か」を誤認しないようにするため
