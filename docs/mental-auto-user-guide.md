# mental-auto User Guide

## mental-autoとは何か

`mental-auto` は、日々の短いメモを 1 日 1 ファイルの Markdown ログとして保存する CLI ツールです。

現時点で安定して使える中心機能は、次の 1 点です。

- その日のメモを `logs/YYYY-MM-DD.md` に保存する

名前から多機能に見えますが、2026-06-25 時点の実装では `stats`、`advice`、`mirror` などはまだ使えません。まずは「日次メモを揃った形式で残し、mobile inbox を後から取り込めるツール」と考えると分かりやすいです。

## 何ができるか

- その日のメモを Markdown で保存できる
- 日付を指定して過去日のログも作れる
- 保存先ディレクトリを変えられる
- メモを通常引数でも `--memo` でも渡せる
- `mobile-inbox` の Markdown を対応日ログへ取り込める
- AI 共有前に最低限マスク済みテキストへ整形できる

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

### `--dry-run` を使う

```bash
node dist/index.js --import-mobile mobile-inbox --dry-run
```

読み取り予定、追記予定、archive 移動予定だけを確認できます。書き換えはしません。

## 毎日の使い方

1. 1 日の終わりに一言メモを書く
2. `node dist/index.js 今日のメモ...` を実行する
3. `logs/YYYY-MM-DD.md` ができたことを確認する
4. 必要ならエディタで追記する

注意:

- 同じ日付で再実行すると、既存ファイルは追記ではなく上書きされます
- 少しずつ足したい場合は、CLI を何度も打つよりエディタで既存ファイルを編集する運用の方が安全です

## よく使うコマンド

```bash
npm run build
npm test
node dist/index.js 今日は少し疲れた
node dist/index.js --date 2026-03-26 今日は少し疲れた
node dist/index.js --memo "専用メモ"
node dist/index.js --output-dir ./tmp 今日は少し疲れた
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

現時点では `stats` 機能はありません。

- `--stats` は使えません
- 実行すると `Unknown option: --stats` で失敗します

## adviceの見方

現時点では `advice` 機能はありません。

- `--advice` は使えません
- advice 文章を生成する処理もありません

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
node dist/index.js --stats
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

### 追記したつもりが内容が消えた

原因:

- この CLI は追記ではなく上書きで保存します

対策:

- 1 日に複数回更新したい場合は既存ログをエディタで編集する
- あるいは別日付ファイルではなく既存ファイルへ手動追記する

## おすすめ運用方法

- 毎日 1 回、短いメモを保存する用途に絞る
- 既存ファイルへの追記は CLI ではなくエディタで行う
- `logs/` に個人情報や強い機微情報を書きすぎない
- Git にログを含めるかどうかを先に決める
- `dist/` と `logs/` の扱いをチーム内で統一する

## 現時点でまだできないこと

- 統計表示
- advice 生成
- mirror JSON 生成
- mirror advice

## 変更理由

- 初見の利用者でも、現時点で本当に使える範囲だけを迷わず試せるようにするため
- 未実装機能を先に明記し、期待値のズレを減らすため
