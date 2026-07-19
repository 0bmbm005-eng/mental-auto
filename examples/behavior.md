# Expected Behavior

## Default save

入力:

```bash
node dist/index.js "今日は少し疲れた"
```

期待:

- JST の当日日付で `logs/YYYY-MM-DD.md` を作る
- 標準出力に `Saved log: /absolute/path/logs/YYYY-MM-DD.md (YYYY-MM-DD)` を出す

## `--date`

入力:

```bash
node dist/index.js --date 2026-03-26 "今日は少し疲れた"
```

期待:

- `logs/2026-03-26.md` を作る

## `--memo`

入力:

```bash
node dist/index.js --memo "専用メモ" ignored
```

期待:

- ログ本文は `専用メモ` だけになる
- `ignored` は本文に入らない

## `--output-dir`

入力:

```bash
node dist/index.js --date 2026-03-26 --output-dir ./tmp "今日は少し疲れた"
```

期待:

- 出力先は `./tmp/2026-03-26.md` ではない
- 出力先は `./tmp/logs/2026-03-26.md`

## Empty memo

入力:

```bash
node dist/index.js --memo ""
```

期待ログ:

```md
# YYYY-MM-DD

_No memo provided_
```

## `--safe-share`

入力:

```bash
node dist/index.js --safe-share "mail=test@example.com key=sk-abcdef1234567890 path=/Users/example/Documents/test"
```

期待:

- ファイルは書き込まない
- stdout に共有向けのマスク済みテキストを出す
- メールアドレス、API key らしき文字列、ローカルパスがマスクされる

## Same-day rerun

入力:

```bash
node dist/index.js --date 2026-03-26 "朝のメモ"
node dist/index.js --date 2026-03-26 "夜のメモ"
```

期待:

- append しない
- 2 回目の実行で同日ファイル全体を上書きする
- 実行後の `logs/2026-03-26.md` には `夜のメモ` だけが残る
