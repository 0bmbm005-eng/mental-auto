# status.md

`mental-auto` の現状を、実装・未実装・構想の境界が混ざらないように整理するためのステータス一覧です。

この文書は 2026-05-19 時点の `README.md`、`AGENTS.md`、`--help`、`src/index.ts`、既存 docs に合わせています。未実装のものは未実装として明記します。

## 1. 現在実装済み機能

- JST 基準で当日日付を `YYYY-MM-DD` 形式で決める
- `logs/YYYY-MM-DD.md` に Markdown ログを保存する
- `logs/` ディレクトリを自動作成する
- `--date YYYY-MM-DD` で対象日を指定する
- `--memo TEXT` で本文を 1 引数として渡す
- `--output-dir PATH` で出力先ベースディレクトリを切り替える
- `--help`, `-h` でヘルプを表示する
- 空メモ時に `_No memo provided_` を書く
- `npm run doctor` でローカル実行状態を点検する
- `--safe-share` で共有前の最低限マスク済みテキストを stdout に出す

## 2. 未実装機能

- same-day append
- `mirror-logs/` 生成
- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`

これらは現行実装では使えません。CLI に渡すと、オプション系は `Unknown option` で失敗します。

## 3. 実験中機能

現時点では、README / `--help` / 実装 / テストのいずれから見ても「実験中」と呼べる機能はありません。

- 実装済みとして安定運用する最小機能
- もしくは未実装

のどちらかです。

## 4. 将来構想

- same-day append の仕様確定
- `logs` 読み出しの共通関数追加
- `--stats` のような読み取り専用機能追加
- `mirror-logs` の責務定義
- `--advice` 系の生成機能追加

この段階では、いずれも構想または検討項目です。実装済み機能として扱わないでください。

## 5. 技術負債

- `src/index.ts` 1 ファイルに CLI パース、日付処理、整形、書き込みが集まっている
- `logs` 読み出しの共通関数がまだない
- same-day append を採用するか上書き維持で固定するかが未確定
- `mirror-logs` の責務が未定義
- `--stats` / `--advice` 系の責務が未定義
- README のセットアップ例を CI 相当で定期確認する仕組みがない

## 6. 安定機能

ここでいう「安定」は、少なくとも README、`--help`、実装、テストの間で解釈が一致している機能です。

- JST 固定の日付決定
- 1 日 1 ファイルの Markdown 出力
- `--date`
- `--memo`
- `--output-dir`
- `--help`, `-h`
- 空メモ時の `_No memo provided_`
- 同日再実行時の上書き

## 7. 破壊的変更予定がある箇所

現時点で確定した破壊的変更予定はありません。

ただし、次の項目は将来変更されると運用影響が大きいです。

- same-day append を導入するかどうか
- 同日再実行時の上書き挙動
- `logs` と `mirror-logs` の責務分担
- 将来の `--stats` / `--advice` 系の入出力仕様

特に same-day append は、現行の上書き前提運用を変えるため、導入時は README / `--help` / docs / テストの同時更新が必要です。

## 8. 今後優先度が高い作業

- same-day append を実装するか、上書き維持で固定するかを決める
- `logs` 読み出しの共通関数を追加する
- README のセットアップを CI 相当で定期確認できるようにする
- `--stats` の責務を定義する
- `--advice` の責務を定義する
- `mirror-logs` の存在意義を定義する

## 参照先

- [README.md](/Users/kei/projects/mental-auto/README.md)
- [AGENTS.md](/Users/kei/projects/mental-auto/AGENTS.md)
- [src/index.ts](/Users/kei/projects/mental-auto/src/index.ts)
- [docs/design.md](/Users/kei/projects/mental-auto/docs/design.md)
- [docs/tasks.md](/Users/kei/projects/mental-auto/docs/tasks.md)
- [docs/mental-auto-spec.md](/Users/kei/projects/mental-auto/docs/mental-auto-spec.md)
