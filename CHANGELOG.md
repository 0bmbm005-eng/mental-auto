# CHANGELOG

この changelog は、`mental-auto` の実装、テスト、README、docs、git 履歴から確認できた事実だけを残すための記録です。

- 基準日: 2026-05-19
- 目的: 人間と AI の引き継ぎで「いつ何が入ったか」を追いやすくする
- 方針: 実装済みと未実装を混同しない。推測は書かない

## 2026-05-19

状態:

- 未コミットのワークツリー変更として確認
- 現在の README / `--help` / docs / test がこの状態を前提にそろっている

追加機能:

- `--memo TEXT` を実装
- `--output-dir PATH` を実装
- `--help`, `-h` を実装
- `--date YYYY-MM-DD` の値検証を追加
- 空メモ時に `_No memo provided_` を出力する挙動を追加
- CLI 実行結果として `Saved log: ...` を表示する挙動を追加
- `package.json` の `name` / `bin` を `mental-auto` に整理

ドキュメント更新:

- `README.md` を運用手順中心に全面整理
- `docs/design.md` を追加し、設計意図と未実装境界を明文化
- `docs/tasks.md` を追加し、今後の TODO を分離
- `docs/status.md` を追加し、実装済み / 未実装 / 構想を整理
- `docs/mental-auto-spec.md` と `docs/mental-auto-user-guide.md` を現行実装に合わせて更新
- `AGENTS.md` を追加し、作業ルールと参照順を明文化

テスト追加:

- `--help` の戻り値と文面のテストを追加
- `--memo` 優先挙動のテストを追加
- `--output-dir` 配下に `logs/YYYY-MM-DD.md` を書くテストを追加
- 不正な `--date` を拒否するテストを追加
- 空メモ時の `_No memo provided_` 出力テストを追加

未実装整理:

- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`
- `mirror-logs/` 生成
- same-day append

破壊的変更:

- なし

今後の予定:

- same-day append を実装するか、上書き維持で固定するか決める
- `logs` 読み出しの共通関数を追加する
- README のセットアップ例を CI 相当で定期確認できるようにする
- `--stats` / `--advice` / `mirror-logs` の責務を定義する

## 2026-03-29

状態:

- `git log` 上のコミット `6755e48`, `7a3e7e4` から確認

追加機能:

- 実装機能の追加は確認できず

ドキュメント更新:

- README のプロジェクト名を `mental-auto` に寄せて整理
- Quick Start と usage examples を更新

テスト追加:

- なし

未実装整理:

- この時点の README 改修だけでは、未実装一覧の確定までは確認できない

破壊的変更:

- なし

今後の予定:

- この時点の commit message だけでは明示されていない

## 2026-03-26

状態:

- `git log` 上のコミット `2242a13` から確認

追加機能:

- JST 基準で当日日付を決める CLI 実行を追加
- `logs/YYYY-MM-DD.md` へ Markdown を書く基本処理を追加
- デフォルト実行で当日メモを保存する挙動を追加

ドキュメント更新:

- README に CLI の基本的な使い方を追加

テスト追加:

- `getJstDateString` のテストを追加
- `renderLog` のテストを追加
- `writeLogFile` のテストを追加

未実装整理:

- このコミット時点では `--memo` / `--output-dir` / `--help` は未実装

破壊的変更:

- なし

今後の予定:

- 実行オプションや運用ドキュメントの整理が必要な状態

## 2026-03-25

状態:

- `git log` 上のコミット `a2210a9` から確認

追加機能:

- `package.json` を含む初期コミット

ドキュメント更新:

- なし

テスト追加:

- なし

未実装整理:

- 初期コミット時点では、現行 README が説明する主要 CLI 機能はまだ未導入

破壊的変更:

- なし

今後の予定:

- CLI 本体とテストの追加が必要な状態
