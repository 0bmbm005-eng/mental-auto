# AGENTS.md

このファイルは、`mental-auto` を触る人間や AI 向けの作業ガイドです。README を読んだあと、実装変更や仕様整理に入る前提で使ってください。

## このリポジトリの現在地

- JST 日付の Markdown ログを書き出す CLI
- 実装の中心は [src/index.ts](src/index.ts) 1 ファイル
- テストは [test/index.test.ts](test/index.test.ts) が正
- `--stats` は実装済み
- `--advice` は最新の日次ログを読み込んで表示する第一段階まで実装済み
- same-day append は実装済み
- `--mirror-stats` / `--mirror-advice` / `mirror-logs` は未実装
- `npm run doctor` は実装済みで、ローカル基本状態の確認に使える
- `--safe-share` は実装済みで、AI 共有前の最低限マスクに使える

## 最優先ルール

- 事実ベースで書く
- 未実装は未実装と明記する
- README は読み物ではなく運用手順として保つ
- 例は必ずコピペ実行可能にする
- 仕様を増やすときは、README と docs を同時に更新する
- 既存機能を変えたらテストを足す

## 変更前に見る場所

1. [README.md](README.md)
2. [src/index.ts](src/index.ts)
3. [test/index.test.ts](test/index.test.ts)
4. [docs/design.md](docs/design.md)
5. [docs/tasks.md](docs/tasks.md)

## セットアップ

```bash
cd mental-auto
npm install
npm run build
npm run doctor
npm test
```

動作確認:

```bash
node dist/index.js "確認メモ"
```

## 実装上の重要ポイント

### 日付

- JST 固定
- `getJstDateString()` が基準
- 日付関連の仕様変更はテスト追加必須

### 出力先

- デフォルトは `logs/YYYY-MM-DD.md`
- `--output-dir` 指定時も `PATH/YYYY-MM-DD.md` ではなく `PATH/logs/YYYY-MM-DD.md`

### 同日再実行

- same-day append は実装済み
- 同じ日付のログが存在する場合、既存内容を保持したまま新しいエントリを末尾に追記する
- 追記エントリには `## Entry YYYY-MM-DD HH:mm:ss JST` 形式のタイムスタンプ見出しが付く
- この仕様を変える場合は、README と docs とテストを同時に更新する

### CLI オプションの実装状況

以下は現時点では未実装。

- `--mirror-stats`
- `--mirror-advice`

`--stats` は実装済み。

`--advice` は最新の日次ログを読み込んで表示する第一段階まで実装済みで、AI による助言生成はまだ行わない。

将来、新しいオプションや機能を実装する場合は、少なくとも次を一緒に更新すること。

- CLI パース
- 単体テスト
- README の実行例
- `docs/design.md` の設計更新
- `docs/tasks.md` の TODO 整理

## ドキュメント更新ルール

- 利用者向けの入口は `README.md`
- 設計意図や未実装境界は `docs/design.md`
- 今後の作業候補は `docs/tasks.md`
- 実装準拠の詳細メモは既存 docs に追記してよい

README に向いている内容:

- セットアップ
- 実行コマンド
- 実際の挙動
- 運用上の注意

README に向いていない内容:

- 未確定の将来仕様
- 長い議論
- ふわっとした構想メモ

## 変更時チェックリスト

```bash
npm run build
npm test
```

仕様変更を含む場合の追加確認:

- README のコマンド例がまだ正しいか
- エラーメッセージ例が実装と一致しているか
- 未実装一覧が古くなっていないか

## よくある誤解

- `mental-auto` は現時点では高度な分析 CLI ではない
- `--advice` は実装済みだが、現時点では AI による助言生成は行わない
- `mirror-logs` はまだ存在しない
- same-day append は実装済み
- 同日再実行では既存ログを上書きせず、新しいエントリを末尾に追記する

## 次に広げるなら

優先度の高い候補は [docs/tasks.md](docs/tasks.md) を参照してください。
