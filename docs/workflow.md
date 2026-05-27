# workflow.md

この文書は、2026-05-19 時点の `mental-auto` で再現可能な AI 共同開発フローをまとめたものです。

目的:

- 未来の自分や別 AI が、現在の進め方を再現しやすくする
- README / `--help` / `docs/status.md` / `AGENTS.md` と矛盾しない運用を残す
- 実装済み機能と未実装機能を混同しない

前提:

- 現在の中心実装は [src/index.ts](/Users/kei/projects/mental-auto/src/index.ts)
- 振る舞い確認の正本は [test/index.test.ts](/Users/kei/projects/mental-auto/test/index.test.ts)
- 利用者向け入口は [README.md](/Users/kei/projects/mental-auto/README.md)
- 状態整理は [docs/status.md](/Users/kei/projects/mental-auto/docs/status.md)
- 作業ガイドは [AGENTS.md](/Users/kei/projects/mental-auto/AGENTS.md)

## 1. ChatGPT の役割

- 要件整理、論点整理、仕様の言語化を担当する
- 実装済みと未実装の境界を文章で明確にする
- README や docs の構成案、更新方針、確認観点をまとめる
- コード説明をするときは、必ず現行実装とテストに合わせる

ChatGPT に期待すること:

- ふわっとした構想を、そのまま README に書かない
- 未確定仕様を「案」または「未実装」として分離する
- 作業前に確認すべきファイルを明示する

## 2. Codex の役割

- 実際のコード変更、docs 変更、テスト追加を担当する
- ワークツリーを見て、現物ベースで差分を作る
- 最小差分で実装と文書をそろえる
- `npm run build` と `npm test` を実行して変更を確認する

Codex に期待すること:

- README を読み物ではなく運用手順として保つ
- 既存機能を変えたらテストを足す
- 仕様変更時は README と docs を同時更新する

## 3. Claude など他 AI レビューの役割

- 既存 docs と差分の整合レビューを担当する
- 実装済み / 未実装 / 将来構想の混線がないかを見る
- README、`--help`、`docs/status.md`、examples、CHANGELOG の言い回し差分を洗う
- 回帰リスク、説明の飛躍、未検証の断定を指摘する

レビューで見る点:

- 実装にない機能を「あるもの」として書いていないか
- エラー例やコマンド例がコピペ実行可能か
- same-day append を誤って追記仕様として書いていないか

## 4. deep research を使う場面

このリポジトリの現行実装確認だけなら、deep research は必須ではありません。

使う場面:

- 外部公開や配布方法を決めるとき
- Node.js / npm / TypeScript まわりの外部仕様確認が必要なとき
- 将来の `--advice` などで外部設計判断が要るとき

使わない場面:

- 現在の CLI 挙動確認
- README / `--help` / docs の整合確認
- `src/index.ts` と `test/index.test.ts` から判断できる範囲

## 5. 最小差分ルール

- まず対象ファイルを限定する
- 既存 docs の表現を使い回し、言い回しの揺れを増やさない
- 実装変更が不要なら docs だけを直す
- docs 変更だけで済むときはコードを触らない
- 未実装項目を実装したように見せる追記をしない

## 6. docs 更新ルール

- 利用者向け入口は `README.md`
- 設計意図や未実装境界は [docs/design.md](/Users/kei/projects/mental-auto/docs/design.md)
- 今後の作業候補は [docs/tasks.md](/Users/kei/projects/mental-auto/docs/tasks.md)
- 現在状態の整理は [docs/status.md](/Users/kei/projects/mental-auto/docs/status.md)
- 変更履歴は [CHANGELOG.md](/Users/kei/projects/mental-auto/CHANGELOG.md)
- コピペ用の期待例は [examples/README.md](/Users/kei/projects/mental-auto/examples/README.md) 以下

更新原則:

- README には運用手順と実際の挙動を書く
- 未確定の将来仕様は README に混ぜない
- 実装準拠の補足は docs に逃がす

## 7. 実装前確認手順

変更前に最低限見る順番:

1. [README.md](/Users/kei/projects/mental-auto/README.md)
2. [src/index.ts](/Users/kei/projects/mental-auto/src/index.ts)
3. [test/index.test.ts](/Users/kei/projects/mental-auto/test/index.test.ts)
4. [docs/design.md](/Users/kei/projects/mental-auto/docs/design.md)
5. [docs/tasks.md](/Users/kei/projects/mental-auto/docs/tasks.md)
6. [docs/status.md](/Users/kei/projects/mental-auto/docs/status.md)
7. [CHANGELOG.md](/Users/kei/projects/mental-auto/CHANGELOG.md)
8. [examples/README.md](/Users/kei/projects/mental-auto/examples/README.md)

そのうえで確認すること:

- 今回触るのは実装か docs か
- 既存挙動を変えるのか、説明だけを直すのか
- 未実装機能の話をしていないか

## 8. README / help / status の整合確認

変更後は次をそろえる:

- README のコマンド例
- `node dist/index.js --help` の文面
- `docs/status.md` の実装済み一覧
- examples の入力例と出力例

確認観点:

- `--memo`, `--output-dir`, `--help`, `--date` の説明が一致しているか
- same-day append が未実装として一致しているか
- `mirror-logs` が未実装として一致しているか
- 未知オプション時のエラー説明が一致しているか

## 9. 未実装機能の扱い

- 未実装は未実装と明記する
- README に「あるもの」として書かない
- examples に動作例を置かない
- docs に書く場合は、責務未定義か構想段階かを分けて書く

現時点の未実装:

- same-day append
- `mirror-logs/` 生成
- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`

## 10. AI へ共有する前の安全確認

- まず `node dist/index.js --safe-share ...` で共有用テキストを作る
- コマンド例がコピペ可能か確認する
- 実装にない機能説明が混ざっていないか確認する
- ローカル絶対パスの扱いが意図通りか確認する
- logs の運用説明が「上書き」で統一されているか確認する
- エラーメッセージ例が現行実装と一致するか確認する

## 11. ローカル運用方針

- clone して使う前提で運用する
- `npm install`、`npm run build`、`npm test` を基本確認にする
- 実行前後の基本状態確認には `npm run doctor` を使う
- 実行確認は `node dist/index.js "確認メモ"` を基準にする
- `logs/` は append-only 前提ではなく、同日再実行で上書きされる前提で扱う
- `--output-dir` を使っても `PATH/logs/YYYY-MM-DD.md` に出る前提で扱う

## 12. 将来の AI 引き継ぎ方針

- まず README で現行機能を把握する
- 次に `src/index.ts` と `test/index.test.ts` で実装事実を確認する
- 次に `docs/status.md` で実装済み / 未実装 / 構想を分けて把握する
- 変更理由は `CHANGELOG.md` を見る
- 期待入出力は `examples/` を見る
- 作業ルールは `AGENTS.md` とこの `workflow.md` を見る

引き継ぎ時に残すべきもの:

- 何を変更したか
- 実装か docs か
- build と test を回したか
- 未実装のまま残したものは何か
- 次の AI が見るべきファイルはどこか
