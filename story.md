# mental-auto
mental-auto は、日々の記録と AI の知識・視点を活用し、利用者自身が感情との向き合い方を学び、感情に振り回されず、自ら受け止め方を選べるよう支援するプロジェクトです。

本リポジトリでは、その基盤となる CLI ツールを開発しています。

短いメモや生活記録を、JST（日本標準時）基準の日付別 Markdown ログとしてローカルに保存できます。

入力したメモは `logs/YYYY-MM-DD.md` に保存され、日ごとの記録をシンプルな Markdown ファイルとして残せます。外出先で作成した Markdown メモを、あとから日次ログへ取りき込むこともできます。

記録は、将来的な AI 分析を見据えた形式で保存・蓄積します。将来的には、AI が記録から心理状態や行動の傾向を分析し、その時の状態に応じた知識や視点を提示します。利用者は、それらを参考にしながら、自分で感情の受け止め方を選べるようになることを目指しています。

> **現在の開発状況**
>
> 現在は、日次ログを安全かつ継続的に蓄積する基盤の構築を中心に開発しています。AI による分析・知識提示機能は、今後追加予定です。



## こんな人向け

- 自分なりの感情の受け止め方を身につけたい人
- 日々の短いメモを、サービスに依存せずローカルに残したい人
- メンタル、睡眠、行動、読書などの日々の記録を、日付ごとの Markdown として残したい人
- 外出先で書いた Markdown メモを、あとで日次ログに集約したい人

## できること

- JST で当日の日付を決めて `logs/YYYY-MM-DD.md` を生成する
- `--date` で対象日を明示指定する
- `--memo` で本文を 1 引数として渡す
- `--output-dir` で出力先のベースディレクトリを切り替える
- `--import-mobile` で `mobile-inbox` の Markdown を対応日ログへ取り込む
- `--dry-run` で `--import-mobile` の予定だけを表示する
- `--safe-share` で共有前の最低限マスクを stdout へ出す
- `--help` / `-h` を表示する

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

## できないこと

現時点では以下は未実装です。指定すると失敗します。

- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`
- `mirror-logs` 生成
- same-day append

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

`mobile-inbox` の 1 ファイルを取り込む:

```bash
node dist/index.js --import-mobile mobile-inbox/2026-06-25.md
```

`mobile-inbox` ディレクトリ内の未取り込み Markdown を順番に処理する:

```bash
node dist/index.js --import-mobile mobile-inbox
```

書き込みなしで予定だけ確認する:

```bash
node dist/index.js --import-mobile mobile-inbox --dry-run
```

共有前にテキストを安全化:

```bash
node dist/index.js --safe-share "contact me at foo@example.com path=/Users/example/mental-auto/logs/2026-03-26.md"
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
npm start -- --import-mobile mobile-inbox --dry-run
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

### `--import-mobile FILE_OR_DIR`

- ファイル指定時はその 1 件を取り込みます
- ディレクトリ指定時は直下の `*.md` をファイル名順で処理します
- 採用するファイル名は `YYYY-MM-DD.md` のみです
- 本文から日付は読みません
- 取り込み先は `PATH/logs/YYYY-MM-DD.md` です
- `## Mobile notes` セクションへ Markdown 本文を追記します
- セクションが無ければログ末尾へ作成します
- ログが無ければ `# YYYY-MM-DD` を持つ新規ログを作成します
- 取り込み後は入力元ディレクトリの `archive/` へ移動します

例:

```bash
node dist/index.js --import-mobile mobile-inbox/2026-06-25.md
node dist/index.js --import-mobile mobile-inbox
```

### `--dry-run`

- `--import-mobile` と一緒に使います
- 読み取り予定ファイル、追記予定ログ、archive 移動予定のみ表示します
- ファイルの書き換えや移動は一切行いません

例:

```bash
node dist/index.js --import-mobile mobile-inbox --dry-run
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
node dist/index.js --safe-share "mail=user@example.com token=sk-1234567890abcdef1234567890 path=/Users/example/mental-auto/logs/2026-03-26.md"
node dist/index.js --safe-share logs/2026-03-26.md
```

補足:

- 過剰な匿名化はしません
- 共有向け整形なので、元ファイルは変更しません
- 出力先は常に stdout です

## mobile-inbox 仕様

想定構成:

```text
mobile-inbox/
├─ 2026-06-25.md
├─ 2026-06-26.md
└─ archive/
```

取り込み後の `logs/2026-06-25.md` 例:

```md
# 2026-06-25

PCで先に書いたメモ

## Mobile notes

外出先メモ

- 駅で気分が落ちた
- コーヒーで少し戻った
```

補足:

- directory 指定時は archive 配下を再処理しません
- 通常ログ保存の same-day append は未実装のままです
- `mobile-inbox` 取り込みは `## Mobile notes` セクションへの追記です

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

現行実装には same-day append はありません。

- 同じ日付で再実行すると既存 `logs/YYYY-MM-DD.md` を上書きします
- 追記ではありません
- 既存内容を保持しながら足す処理はありません
- 実装上は `writeFile(...)` で毎回ファイル全体を書き換えます

運用上の注意:

```bash
node dist/index.js "朝のメモ"
node dist/index.js "夜のメモ"
```

この 2 回目の実行後、残るのは `夜のメモ` だけです。

1 日に複数回書きたい場合は、今は次のどちらかで運用してください。

- その日の全文を毎回まとめて渡す
- 生成後の Markdown をエディタで手動追記する

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

不正な日付:

```bash
node dist/index.js --date 2026-13-01
```

未知オプション:

```bash
node dist/index.js --stats
```

値不足:

```bash
node dist/index.js --date
node dist/index.js --memo
node dist/index.js --output-dir
```

mobile inbox の日付形式不正:

```bash
node dist/index.js --import-mobile mobile-inbox/2026-6-25.md
```

mobile inbox の read / log update / archive move 失敗:

- `mental-auto failed: Failed to read Markdown: ...`
- `mental-auto failed: Failed to create or update log: ...`
- `mental-auto failed: Failed to archive mobile file: ...`

## リポジトリの見方

- [src/index.ts](src/index.ts): CLI 本体
- [test/index.test.ts](test/index.test.ts): 振る舞いの最小テスト
- [docs/mental-auto-spec.md](docs/mental-auto-spec.md): 実装準拠の仕様メモ
- [docs/mental-auto-user-guide.md](docs/mental-auto-user-guide.md): 利用者向け補足
- [docs/design.md](docs/design.md): 設計意図と未実装境界
- [docs/tasks.md](docs/tasks.md): 今後の TODO
- [AGENTS.md](AGENTS.md): 将来の作業者向けガイド
