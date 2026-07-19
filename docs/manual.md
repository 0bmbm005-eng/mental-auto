# mental-auto manual

この manual は v0.1 時点の実装済み機能だけを扱います。詳しい背景は [README.md](../README.md) と [docs/status.md](status.md) を参照してください。

## セットアップ

```bash
npm install
npm run build
npm test
npm run doctor
```

## 基本実行

```bash
node dist/index.js "今日は少し疲れた"
```

JST 基準の日付で `logs/YYYY-MM-DD.md` を作成します。同じ日付で再実行すると追記ではなく上書きします。

## 実装済みオプション

### `--date YYYY-MM-DD`

```bash
node dist/index.js --date 2026-03-26 "今日は少し疲れた"
```

対象日を明示します。不正な日付は `Invalid value for --date: ...` で失敗します。

### `--memo TEXT`

```bash
node dist/index.js --memo "今日は気分が重い"
```

本文を 1 引数で渡します。`--memo` を使った場合、通常引数は本文に追加されません。

### `--output-dir PATH`

```bash
node dist/index.js --output-dir ./tmp "退避メモ"
```

実際の出力先は `PATH/logs/YYYY-MM-DD.md` です。

### `--import-mobile FILE_OR_DIR`

```bash
node dist/index.js --import-mobile mobile-inbox/2026-06-25.md
node dist/index.js --import-mobile mobile-inbox
```

`YYYY-MM-DD.md` の Markdown を対応する `logs/YYYY-MM-DD.md` へ取り込みます。本文は `## Mobile notes` セクションへ追記され、取り込み後は `archive/` へ移動します。

### `--dry-run`

```bash
node dist/index.js --import-mobile mobile-inbox --dry-run
```

`--import-mobile` の予定だけを表示します。ファイルの書き換えや移動は行いません。

### `--safe-share INPUT`

```bash
node dist/index.js --safe-share "mail=user@example.com path=/Users/example/mental-auto/logs/2026-03-26.md"
node dist/index.js --safe-share logs/2026-03-26.md
```

共有前の最低限マスク済みテキストを stdout に出します。入力が既存ファイルなら内容を読み、そうでなければ文字列として扱います。元ファイルは変更しません。

### `--help`, `-h`

```bash
node dist/index.js --help
```

ヘルプを表示して終了します。ファイルは書き込みません。

## 未実装

以下は v0.1 では使えません。指定すると未知オプションとして失敗します。

- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`
- `mirror-logs/` 生成
- same-day append
