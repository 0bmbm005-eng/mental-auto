# mental-auto
mental-auto は、日々の短いメモを JST（日本標準時）基準の日付ごとの Markdown ファイルとしてローカルに蓄積する CLI ツールです。

将来的には、AI の知識・視点を活用しながら、記録を振り返り、感情と向き合い、その経験から学び、自分自身で受け止め方を選べるようになることを目指したプロジェクトです。

> **現在の開発状況**
>
> 現在は、日次ログを安全かつ継続的に蓄積する基盤の構築を中心に開発しています。AI による分析・知識提示機能は、今後追加予定です。

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

## 未実装の機能

現時点では以下は未実装です。指定すると失敗します。

- `--stats`
- `--advice`
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

既存ログを共有前に安全化:

```bash
node dist/index.js --safe-share logs/2026-03-26.md
```

ヘルプ表示:

```bash
node dist/index.js --help
```

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

## `--stats` / `--advice` / `--mirror-stats` / `--mirror-advice`

すべて未実装です。

現行コードの挙動:

- これらのオプションは `parseArgs` で解釈されません
- `--` で始まる未知オプションとして `Unknown option` エラーになります
- 集計、助言生成、mirror 集計、mirror 助言生成のロジックも存在しません

確認例:

```bash
node dist/index.js --stats
node dist/index.js --advice
node dist/index.js --mirror-stats
node dist/index.js --mirror-advice
```

期待結果:

```text
mental-auto failed: Unknown option: --stats
```

他 3 つも同様です。

## 典型的なエラー
代表的なエラーの例です。

### 不正な日付

```bash
node dist/index.js --date 2026-13-01
```

### 未知オプション

```bash
node dist/index.js --stats
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
