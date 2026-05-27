# examples

`examples/` は、2026-05-19 時点の実装済み CLI 挙動だけを確認するためのサンプル置き場です。

- 実装済み機能のみ含める
- 未実装機能は「動く例」として置かない
- README / `--help` / `docs/status.md` と矛盾しない内容だけを置く
- 将来の差分確認や AI 引き継ぎで比較しやすいよう、出力例は固定文面で残す

ファイル一覧:

- `basic-command.sh`: 基本的な入力例
- `basic-log.md`: 生成される Markdown ログ例
- `errors.txt`: 実装済みエラー系の出力例
- `help.txt`: `node dist/index.js --help` の出力例
- `behavior.md`: 実装済み機能の期待動作例
