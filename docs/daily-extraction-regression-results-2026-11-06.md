# 完了行動の指示修正後の小規模回帰確認（2026-11-06）

## 対象と比較条件

[完了した本人行動をactionとする指示修正](daily-extraction-completed-action-results-2026-11-05.md)が、以前は正しく処理できていた匿名ケースを悪化させていないか、既存fixtureの4入力で限定確認しました。確認時のmain・ローカルのorigin/main・HEADは `34f8570969f446241241d17c6a31aba4e7036b79` で一致し、作業ツリーはクリーンでした。リモートへのfetchはしていません。

最新修正で直接参照した `completed-and-wish`、`multi-clause-wish`、`nonperformance-and-state`、`inferred-own-action` は除外しました。入力全文・日付・期待配列は既存の匿名評価fixtureと照合済みで、実ログは読んでいません。未知入力の評価ではありません。

- モデル: `qwen3:14b-q4_K_M`。評価時に比較元とのモデルdigest・既定パラメータ・テンプレートの一致を確認しました。
- `think: false`、`temperature: 0`、`stream: false`。各入力1回、計4回。追加生成・再試行なし。
- 比較元は[2026-11-03の例示あり評価](daily-extraction-few-shot-results-2026-11-03.md)の各入力3応答です。
- Ollamaは比較元の0.40.13から今回の0.40.14へ変わっています。同一環境で旧指示を再実行した比較ではなく、指示変更だけの効果は分離できません。
- 日付とIDはモデル生成ではなく、入力fixtureの日付を使ってローカルで付与・照合します。モデルの抽出要素は `quote` と `kind` のみです。

## 結果

| 種類 | 入力ID | 匿名入力 | 以前 → 今回 | 判定 |
|---|---|---|---|---|
| actionのみ | prior21/short-action | 切符を買った。 | action → action | 維持 |
| observationのみ | prior21/nonperformance | 昨日は旅程を調べなかった。 | observation → observation | 維持 |
| 混在 | prior21/mixed-statements | ベルを押したが、音は聞こえなかった。 | action＋observation → 同じ分割・分類 | 維持 |
| 自己評価 | new10/self-evaluation | 自分は説明が苦手だと思った。 | selfEvaluation → selfEvaluation | 維持 |

維持4、改善0、悪化0、比較不能0でした。JSON構造・種類、引用の入力原文への完全一致、ローカル付与日付の一致、余分なキーの不在は4/4合格です。期待配列とも完全一致し、脱落・余分な抽出はありませんでした。各ケースの保存済み3応答と、引用・分類・順序が完全一致しました。混在文は「ベルを押した」をaction、「音は聞こえなかった。」をobservationとして保持しています。

機械検証と意味分類の評価は別です。意味判定は既存の固定期待値との照合およびCodexによる暫定評価です。各1回・計4回の限定確認であり、一般的な回帰不在を保証する評価ではありません。全件回帰、未知入力、複数日の一般化、後続助言品質は未確認です。CLI未接続・モデル採用未確定の境界も変えていません。

## 保存物とローカル検証

[保存先](evidence/daily-extraction-regression-2026-11-06/)には次を記録しました。

- `protocol.json`: 検証に必要な項目だけを残した派生版です。元protocol.jsonのSHA-256を `sourceProtocolSha256` に保存し、`derivedFromSanitizedSource: true` と除去項目を明記しました。モデル保存先や未使用モデル情報を含む環境の一覧は保存していません。元ファイル自体は収録していないため、保存物だけでは元ファイルのハッシュを再計算できません。
- `response-1.json`〜`response-4.json`、`results.json`: 保存前にローカル絶対パス、実ログ、認証情報、未使用モデル情報がないことを確認し、一時保存ファイルとバイト一致で保存しました。
- `verify.mjs`: 保存応答を既存の保存済み検証実装で読み戻し、匿名fixture・期待値・比較元3応答・送信リクエストのハッシュと照合します。Ollamaへの通信や生成は行いません。
- `manifest-sha256.json`: このディレクトリの他7ファイルのSHA-256です。比較に使う既存保存物のハッシュはprotocol.jsonにも記録しています。

保存されていない試行の実測経過時間や終了時環境は補っていません。生応答に含まれるサーバー報告の時刻・処理時間はそのまま保持し、未保存の実測経過時間とは区別します。

リポジトリルートで、Ollamaに接続せず再検証できます。

```bash
node docs/evidence/daily-extraction-regression-2026-11-06/verify.mjs
```

次のnpm scriptでも再検証できます。CIでも同じ検証を既存テストの後に実行します。

```bash
npm run test:evidence
```

現在の対象は2026-11-06の限定回帰証拠だけです。比較元の保存応答・参照物との照合も含みますが、過去の評価全件を再検証するものではありません。保存証拠の破損を検出する検証であり、現在のモデル生成品質の回帰検出ではありません。

記録追加時にOllamaは再実行していません。ソース・テスト・既存評価記録の変更、コミット・pushは行っていません。
