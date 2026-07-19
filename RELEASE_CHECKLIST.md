# v0.1 release checklist

このチェックリストは 2026-06-01 時点の v0.1 区切り用です。push や release 作業は含めません。

## 1. README と docs の整合性確認

- [x] README は `--date`、`--memo`、`--output-dir`、`--safe-share`、`--help` を実装済みとして説明している
- [x] README は `--stats`、`--advice`、`--mirror-stats`、`--mirror-advice`、`mirror-logs`、same-day append を未実装として説明している
- [x] `docs/status.md`、`docs/design.md`、`docs/mental-auto-spec.md`、`docs/mental-auto-user-guide.md` は同じ未実装境界を説明している
- [x] `docs/manual.md` は旧構想ベースの記述をやめ、v0.1 の実装済み機能だけに整理済み
- [x] `docs/spec.md` は空ファイルではなく、仕様正本への入口として整理済み

根拠:

- [README.md](README.md)
- [docs/status.md](docs/status.md)
- [docs/design.md](docs/design.md)
- [docs/manual.md](docs/manual.md)
- [docs/spec.md](docs/spec.md)
- [src/index.ts](src/index.ts)
- [test/index.test.ts](test/index.test.ts)

## 2. ドキュメント不足の洗い出し

- [x] 利用開始手順は README と user guide にある
- [x] 実装済み / 未実装 / 将来構想の境界は status と design にある
- [x] 今後の作業候補は tasks にある
- [x] AI 共同作業の再開手順は AGENTS と workflow にある
- [x] v0.1 前チェック観点はこのファイルにある

不足として残すもの:

- [ ] npm 配布手順は未整備。現状は `private: true` の clone 運用前提
- [ ] same-day append、stats、advice、mirror の仕様詳細は未確定。実装前に個別設計が必要

## 3. examples の不足確認

- [x] 基本保存: `examples/basic-command.sh`、`examples/basic-log.md`
- [x] `--date`: `examples/basic-command.sh`、`examples/behavior.md`
- [x] `--memo`: `examples/basic-command.sh`、`examples/behavior.md`
- [x] `--output-dir`: `examples/basic-command.sh`、`examples/behavior.md`
- [x] `--help`: `examples/help.txt`
- [x] エラー例: `examples/errors.txt`
- [x] `--safe-share`: `examples/safe-share-check.txt`、`examples/behavior.md`
- [x] same-day append 未実装の注意: `examples/behavior.md`

判断:

- examples は v0.1 の主要機能を説明できている
- 未実装機能の動作例は置かない方針を維持する

## 4. リリース前チェック

- [x] `package.json` と `package-lock.json` の name/bin/version が `mental-auto` v0.1 に揃っている
- [x] README の clone URL が現在の origin と一致している
- [x] safe-share は外部通信せず stdout へ出す説明になっている
- [x] 同日再実行は上書きであり、append と誤読されない
- [x] 個人情報を含む実ログや共有用出力を追加していない
- [x] push / release 作業は行っていない

## 5. 検証コマンド

2026-06-01 に以下を実行済み。

```bash
npm run build
npm test
npm run doctor
node dist/index.js --help
```

結果:

- [x] `npm run build`: 成功。`mental-auto@0.1.0 build` として `tsc -p tsconfig.json` が完了
- [x] `npm test`: 成功。2 files / 15 tests passed
- [x] `npm run doctor`: 成功。Node.js、`package.json`、`dist/`、`logs/`、`tsconfig.json`、build status、write permission がすべて OK
- [x] `node dist/index.js --help`: 成功。`--safe-share` と未実装オプション一覧を含むヘルプを表示
- [x] `git diff --check`: 成功。空白エラーなし
- [x] stale text 検索: `playground`、`YOUR_USERNAME`、`--interactive`、旧 README 差異説明は検出なし

## 6. 今後の推奨タスク

優先度高:

- same-day append を実装するか、上書き維持で固定するかを決める
- `logs` 読み出しの共通関数を追加する
- README のセットアップ例を CI 相当で定期確認できるようにする

優先度中:

- `--stats` の責務、対象期間、標準出力形式を定義する
- `--advice` をルールベースにするか LLM ベースにするか決める
- `mirror-logs` の存在意義と正本 / 派生データの責務分担を定義する

優先度低:

- ローカルインストールで `mental-auto` を呼びやすくする手順を追加する
- README 冒頭に短い英語補足を追加する
