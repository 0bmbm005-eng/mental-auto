# mental-auto Specification

## プロジェクト概要

`mental-auto` は、日次メモを Markdown のログファイルとして保存する TypeScript 製 CLI ツールです。現行コードベースでは、1 回の実行で 1 日分のログファイルを `logs/YYYY-MM-DD.md` に書き出す機能が中心です。

この文書は 2026-06-25 時点のワークツリーを対象に、実装・README・テストから確認できた事実だけを整理したものです。不明な点や未実装の機能は、そのまま「不明」「未実装」と記載します。

## 目的

- 日々のメモを一定形式の Markdown ログとして残す
- JST 基準の日付でログファイルを生成する
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

### 未実装・未対応オプション

以下は現行コードベースには存在せず、実行すると `Unknown option` エラーになります。

- `--stats`
- `--advice`
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

2026-05-19 時点で確認できた構成です。

```text
mental-auto/
├─ README.md
├─ DEV_CHECKLIST.md
├─ RUN_REPORT_2026-03-25.md
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ AGENTS.md
├─ src/
│  ├─ doctor.ts
│  ├─ index.ts
│  └─ safe-share.ts
├─ test/
│  ├─ doctor.test.ts
│  └─ index.test.ts
├─ dist/
│  ├─ doctor.js
│  └─ index.js
├─ logs/
│  ├─ 2026-03-26.md
│  ├─ 2026-03-29.md
│  └─ 2026-04-05.md
└─ docs/
   ├─ design.md
   ├─ mental-auto-spec.md
   ├─ status.md
   ├─ tasks.md
   └─ mental-auto-user-guide.md
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

append は未実装です。

- `writeFile(filePath, content, "utf8")` により毎回全内容を書き込みます
- 同日の既存ファイルがある場合、追記ではなく上書きされます
- 既存メモを保持しながら追加する仕様は現行コードにはありません

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

現行コードベースでは未実装です。

- `--advice` オプションなし
- advice 生成ロジックなし
- advice 出力形式の定義なし
- advice 用テストなし

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
- 2026-06-01 時点で実行成功を確認

### `npm test`

- `vitest run` を使う最小構成です
- Vitest 設定ファイルはなく、デフォルト設定で実行されています
- 2026-06-01 時点で 2 ファイル 15 テスト成功を確認

## テスト構成

`test/index.test.ts` の対象は以下です。

- `getJstDateString`
  - UTC 時刻から JST 日付へ変換できること
- `renderLog`
  - 通常メモのレンダリング
  - 空メモ時の `_No memo provided_`
- `formatHelp`
  - Usage と `--date` の表示
- `runCli`
  - `--help` 時の戻り値
  - `--date` + `--memo` + `--output-dir` の書き込み
- `--memo` 指定時に通常引数を無視すること
- 無効日付を拒否すること
- mobile inbox 取り込み
- dry-run
- directory 指定
- invalid filename 拒否
- `writeLogFile`
  - `logs/` 自動作成とファイル書き込み

## 回帰テスト対象

現行テストで回帰を検知できる範囲:

- JST 日付計算
- ログ Markdown 形式
- ヘルプ出力の基本文言
- カスタム出力先への書き込み
- `--memo` 優先仕様
- 不正な `--date` の拒否
- mobile import の正常系
- mobile import の dry-run
- invalid mobile inbox filename の拒否

現行テストで未カバーの範囲:

- 直接実行時の標準出力文言
- `--output-dir` 不正値時の挙動
- `--date` / `--memo` / `--output-dir` の値欠落エラー
- 未知オプションエラー
- 同日ファイル上書き
- README 記載コマンドとの整合

## 今後拡張しやすいポイント

- `parseArgs` を独立モジュール化するとオプション追加に強くなる
- ログ生成、ファイル保存、CLI 表示を分離すると機能追加しやすい
- 将来の `mirror` / `stats` / `advice` を別モジュール化しやすいほど現在の責務分離余地が大きい
- 出力を Markdown 以外にも広げるならデータモデル層が必要
- analyzer 系を実装するなら専用ユニットテスト群を `test/analyzers/` などへ分離しやすい

## 現時点の制限事項

- 1 ファイル構成で責務が集中している
- ログは追記ではなく上書き
- JSON 出力なし
- mirror 機能なし
- stats 機能なし
- advice 機能なし
- interactive モードなし
- exercise / sauna 判定なし
- README は現行 CLI オプションと未実装境界を説明している

## セキュリティ上の注意

- ログ本文はそのまま Markdown として保存されるため、個人情報や機微情報が平文で残る
- `logs/` 配下に実データがあり、現在の Git 管理状況では一部ログが追跡済み
- `dist/` も `.gitignore` 対象なのに追跡済みで、生成物差分が残りやすい
- 出力先に任意パスを指定できるため、誤って共有フォルダへ保存しない運用が必要

## 運用上の注意

- 同じ日付で再実行すると既存ログを上書きする
- `README.md` は現行 CLI オプション全体を説明している
- `dist/index.js` を実行する前に `npm run build` が必要
- `logs/` と `dist/` は Git 上で追跡済みファイルがあるため、運用ルールを決めないと差分が散らばる

## READMEと実装の差異

- README は `--memo`、`--output-dir`、`--safe-share`、`--help`、エラー、上書き仕様を説明している
- README は `--stats` などの未実装機能を「できないこと」として明記している
- README のコードブロックは閉じられている

## 変更理由

- 実装と README のズレを減らし、現行コードで実際に使える機能だけを文書化するため
- 未実装機能を明示し、今後の改修時に「何がある前提か」を誤認しないようにするため
