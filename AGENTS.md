# AGENTS.md

このファイルは、`mental-auto` を触る人間や AI 向けの作業ガイドです。README を読んだあと、実装変更や仕様整理に入る前提で使ってください。

## このリポジトリの現在地

- 2026-05-19 時点では、JST 日付の Markdown ログを書き出す最小 CLI
- 実装の中心は [src/index.ts](/Users/kei/projects/mental-auto/src/index.ts) 1 ファイル
- テストは [test/index.test.ts](/Users/kei/projects/mental-auto/test/index.test.ts) が正
- `stats` / `advice` / `mirror-*` / same-day append は未実装
- `npm run doctor` は実装済みで、ローカル基本状態の確認に使える
- `--safe-share` は実装済みで、AI 共有前の最低限マスクに使える

「名前から想像される機能」と「実装済み機能」に差があります。必ずコードとテストを見てから説明・修正してください。

## 最優先ルール

- 事実ベースで書く
- 未実装は未実装と明記する
- README は読み物ではなく運用手順として保つ
- 例は必ずコピペ実行可能にする
- 仕様を増やすときは、README と docs を同時に更新する
- 既存機能を変えたらテストを足す

## 変更前に見る場所

1. [README.md](/Users/kei/projects/mental-auto/README.md)
2. [src/index.ts](/Users/kei/projects/mental-auto/src/index.ts)
3. [test/index.test.ts](/Users/kei/projects/mental-auto/test/index.test.ts)
4. [docs/design.md](/Users/kei/projects/mental-auto/docs/design.md)
5. [docs/tasks.md](/Users/kei/projects/mental-auto/docs/tasks.md)

## セットアップ

```bash
cd /Users/kei/projects/mental-auto
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

- append ではなく上書き
- ここを変えると運用仕様が変わるため、README と docs の更新を忘れないこと

### 未実装オプション

以下を README に「あるもの」として書かないこと。

- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`

将来実装する場合は、少なくとも次を一緒に作ること。

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
- `mirror-logs` はまだ存在しない
- same-day append もまだ存在しない
- `logs` は append-only ストレージではなく、同日再実行で上書きされる

## 次に広げるなら

優先度の高い候補は [docs/tasks.md](/Users/kei/projects/mental-auto/docs/tasks.md) を参照してください。
