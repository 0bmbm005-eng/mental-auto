# 日別抽出：観察と実行済み行動を分ける作業台の例（2026-11-11）

現行版 `0b31fe4` の温室例直後に、観察と実行済み行動を分け、行動の時間句を残す作業台の例を1件だけ追加した。両系列とも各入力・各版を3回実行し、送信前にリクエスト差分が例1件だけであることを確認した。Ollama は `0.40.16`、モデルは `qwen3:14b-q4_K_M`（digest: `bdbd181c33f2ed1b31c972991882db3cf4d192569092138a7d29e973cd9debe8`）、生成設定は `temperature: 0`、`think: false`、`stream: false`。矢印は現行 → 候補。

## 固定3入力の候補評価（現行9試行・候補9試行）

[期待値](evidence/daily-extraction-workbench-2026-11-11/fixed-3/expected.json)、[現行9試行](evidence/daily-extraction-workbench-2026-11-11/fixed-3/current-trials.jsonl)、[候補9試行](evidence/daily-extraction-workbench-2026-11-11/fixed-3/candidate-trials.jsonl)、[集計](evidence/daily-extraction-workbench-2026-11-11/fixed-3/summary.json)、[リクエスト差分](evidence/daily-extraction-workbench-2026-11-11/fixed-3/request.diff)。集計と差分は保存済みの試行記録とリクエストから作成した。

| 入力 | 分離・分類 | 時間句の保持 | 引用全体の完全一致 | 機械検証 |
|---|---:|---:|---:|---:|
| 搬入口のランプ | 3/3 → 3/3 | 3/3 → 3/3 | 0/3 → 3/3 | 3/3 → 3/3 |
| 控室の窓 | 3/3 → 3/3 | 0/3 → 3/3 | 0/3 → 0/3 | 3/3 → 3/3 |
| 掲示板の時計 | 3/3 → 3/3 | 0/3 → 3/3 | 0/3 → 3/3 | 3/3 → 3/3 |
| 合計 | 9/9 → 9/9 | 3/9 → 9/9 | 0/9 → 6/9 | 9/9 → 9/9 |

分離・分類は観察と推測・行動の中心部分が別々の引用に入り、期待する分類になっているかで判定した。時間句は期待する分類の引用内に残っている場合に合格とした。控室の推測引用は候補版で時間句と句点を含めて一致したが、観察引用は3回とも「控室の窓が開いていたので」となり、末尾に「ので」が残った。

## 固定11入力の回帰確認（現行33試行・候補33試行）

[11月9日の検証記録](daily-extraction-greenhouse-results-2026-11-09.md)の固定11入力と当時の採点基準を使い、両版を同じ環境で再実行した。過去の試行と固定3入力の試行はこの集計に含めない。[入力・期待値・リクエスト](evidence/daily-extraction-workbench-2026-11-11/fixed-11/cases.json)、[66試行](evidence/daily-extraction-workbench-2026-11-11/fixed-11/trials.jsonl)、[入力別集計](evidence/daily-extraction-workbench-2026-11-11/fixed-11/summary.json)、[リクエスト差分](evidence/daily-extraction-workbench-2026-11-11/fixed-11/request.diff)は実行時のファイルを保存した。固定4入力の原文・期待値・時間句は11月9日の試行記録から復元し、残る7入力は当時参照した11月7日の比較データから取得した。

入力ごとの引用・分類は対応する33組すべてで一致し、悪化した入力はなかった。分離・分類または内容判定は33/33 → 33/33、時間句の保持は独立した期待値のある4入力で12/12 → 12/12、完全一致は24/33 → 24/33、機械検証は33/33 → 33/33。完全一致しなかった以下の3入力では、両版とも各3回、引用の末尾の句点が欠けた。

- 花壇の支柱・`inference`：「昨夕にその支柱を立てたのは私だったのだろう」
- `event-before-action`・`action`：「編集中の文書を保存した」
- `completed-and-wish`・`wish`：「面談までに経歴を整理して、話す順序を決めたい」

評価範囲はこの固定入力に限る。未知入力への効果や後続の助言品質は検証していない。日別抽出はCLI未接続。
