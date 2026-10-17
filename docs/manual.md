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
