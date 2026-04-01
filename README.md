# Security Checker CLI

ローカルのリポジトリ、ログ、Markdown、設定ファイルを走査し、公開前に見直すべき情報を `SAFE / REVIEW / BLOCK` で分類する CLI です。

このツールは人間による最終確認を補助する一次スクリーニングであり、安全性を保証するものではありません。

## Features

- 再帰走査でテキストファイルを確認
- 危険ファイル名、機密パターン、個人情報候補を検出
- Git 追跡対象と staged ファイルを検査
- `.gitignore` の不足候補をレビュー指摘
- ターミナル出力に加えて Markdown / JSON レポートを生成
- 10MB 超ファイルの stream 走査と 1MB 行上限
- UTF-8 デコードエラーの REVIEW 報告
- symlink 循環回避
- `pre-commit` から実行可能
- `allowlist` で誤検知を抑制

## Setup

```bash
npm install
```

Node.js は `18` 以上を想定しています。

## Usage

```bash
npm run build
npm test
node dist/index.js
node dist/index.js --path .
node dist/index.js --path . --report
node dist/index.js --path . --json
node dist/index.js --path . --report --json --output-dir ./reports
node dist/index.js --path . --staged
node dist/index.js --path . --strict
node dist/index.js --path . --skip-large
node dist/index.js --path . --enable-rule japanese-name
```

### Options

- `--path <dir>`: 走査対象ディレクトリ。デフォルトは `process.cwd()`
- `--report`: `security-report.md` を出力
- `--json`: `security-report.json` を出力
- `--output-dir <dir>`: レポート出力先。デフォルトは走査ルート
- `--staged`: staged ファイルのみ検査
- `--strict`: `REVIEW` も非 0 終了対象にする
- `--config <path>`: 追加ルール設定を読み込む
- `--quiet`: stdout を抑制
- `--concurrency <n>`: 並列処理数。デフォルトは `4`
- `--skip-large`: `maxFileSizeBytes` を超えるファイルを REVIEW にしてスキップ
- `--no-mask`: JSON レポートで生値を出力
- `--enable-rule <name>`: デフォルト無効ルールを有効化

## Scripts

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "vitest run",
    "sec:check": "node dist/index.js --path . --report",
    "sec:check:json": "node dist/index.js --path . --report --json",
    "sec:check:staged": "node dist/index.js --staged --report"
  }
}
```

## Exit Codes

- `0`: `SAFE` のみ
- `1`: `BLOCK` あり
- `2`: 実行エラー
- `3`: `--strict` かつ `REVIEW` あり

## Configuration

デフォルトではルートの `security-rules.json` を読み込みます。`--config` を使うと別パスの追加設定を読み込めます。

```json
{
  "schemaVersion": "1.0",
  "additionalBlockPatterns": [
    { "name": "InternalID", "pattern": "ID_[0-9]{5}" }
  ],
  "allowlist": {
    "paths": [
      { "pattern": "test/fixtures/*", "matchType": "glob" },
      { "pattern": "src/examples/.*\\.example$", "matchType": "regex" }
    ],
    "pathPatternCombination": "OR",
    "patterns": ["example@email.com"]
  },
  "maxFileSizeBytes": 104857600,
  "reportPrefix": "security-report"
}
```

設定は `CLI > security-rules.json > defaults` の順でマージされます。ランタイムの検証は `src/config.ts` が担当し、設計用スキーマは [config/schema.json](config/schema.json) にあります。

### allowlist

- `allowlist.paths` は `glob` または `regex` でパスを評価します
- `pathPatternCombination` は `OR` または `AND` を使えます
- `allowlist.patterns` は検出メッセージと excerpt に対して評価します
- `allowlist` は常に最優先で、`BLOCK` や `REVIEW` より先に `SAFE` 扱いになります

### `.env` 系ファイル

- `SAFE`: `.env.example`, `.env.sample`, `.env.template`
- `REVIEW`: `.env.local`, `.env.test`
- `BLOCK`: `.env`, `.env.production`, `.env.secrets`, `production` を含む `.env.*`, その他の `.env.*`

## Reports

Markdown レポートは `security-report.md`、JSON レポートは `security-report.json` として対象ディレクトリに出力されます。`--output-dir` と `reportPrefix` を使うと出力先と接頭辞を変えられます。

レポートには以下が含まれます。

- 走査件数サマリ
- `BLOCK` 一覧
- `REVIEW` 一覧
- 補足メモ

ターミナルと Markdown は常にマスク済みで、JSON も標準ではマスクされます。生値が必要な場合だけ `--no-mask` を使ってください。

## pre-commit

`.husky/pre-commit` から以下を実行できます。

```bash
npm run sec:check:staged
```

`BLOCK` があるとコミットを止めます。`REVIEW` は標準では警告扱いです。

## Notes

- 外部 API への送信は行いません
- バイナリファイルは原則スキップします
- UTF-8 として読めないファイルは REVIEW として報告します
- `--staged` はワークツリーではなく index の内容を検査します
- ダミー値と実値の厳密な区別はできません
- 文脈依存の機密や匿名化不足は誤検知を含む可能性があります
- 誤検知対応は [docs/false-positive-guide.md](docs/false-positive-guide.md) を参照してください
