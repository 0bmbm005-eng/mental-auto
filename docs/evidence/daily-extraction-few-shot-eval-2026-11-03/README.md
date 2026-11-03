# 3例追加版と新12入力の評価記録

新12入力は固定済み3例追加プロンプトの確定後に作成し、推論前にnew12-expectations.jsonへ全文・期待配列・判定理由・許容差・UTF-8のSHA-256を保存しました。プロンプト・期待値は推論開始後に変更しません。期待値に曖昧さが見つかった場合は変更せず判定保留とします。

- protocol.json: 両プロンプト全文・共通Schema・生成設定・モデルdigest・各ハッシュ・入力・予定ジョブ順・開始環境。
- trials.jsonl: 実送信ハッシュ、HTTP応答原文とハッシュ、検証後配列、時間・エラー。共通テンプレートと入力から実送信JSONを復元できます。
- first-trial-check.json: 初回1試行の記録読み戻し・解析・検証。165試行に算入。
- completion.json・final-environment.json: 実行件数と終了環境。
- source-snapshot.tar.gz・build/: 使用ソースと外部生成物。元のバイト列を保持します。
- run.mjs: 逐次実行用ハーネス。アプリの実装は変更せず、例示なし条件は評価用fetchの送信system本文だけを保存済み版へ置き換えます。
- verify.mjs: 165件の順序・入力/送信/応答ハッシュ・解析・引用検証を読み取り専用で再確認。
- preparation-note.json: 推論前のID衝突解消と固定条件の経緯。

モデルはqwen3:14b-q4_K_M、必要digestはbdbd181c33f2ed1b31c972991882db3cf4d192569092138a7d29e973cd9debe8。temperature:0、think:false、stream:false、seed未指定、マスクなし。前回のモデル既定値・テンプレート・Ollamaサーバー版との一致も確認します。

例示なしは直前の判断順変更版、例示ありは固定済み3例追加版です。両者の差は末尾の3例だけです。既存31入力は例示あり×各3回＝93試行、新12入力は例示なし/あり×各3回＝72試行、計165試行を順番に実行します。43個の異なる入力、55個の入力と条件の組です。

再実行はリポジトリルートで、別の空保存先を使ってください。以下のrun.mjsはOllamaへの推論を実行します。保存済みfixtureをそのまま使い、出力を見て期待値を書き換えないでください。

```bash
eval_build_dir=$(mktemp -d /private/tmp/mental-auto-few-shot-replay.XXXXXX)
printf '{"type":"module"}\n' > "$eval_build_dir/package.json"
./node_modules/.bin/tsc -p tsconfig.json --outDir "$eval_build_dir/build"
eval_output_dir=$(mktemp -d /private/tmp/mental-auto-few-shot-records.XXXXXX)
cp docs/evidence/daily-extraction-few-shot-eval-2026-11-03/new12-expectations.json "$eval_output_dir/new12-expectations.json"
EVAL_OUT="$eval_output_dir" EVAL_BUILD="$eval_build_dir/build" node docs/evidence/daily-extraction-few-shot-eval-2026-11-03/run.mjs
```

初回の記録ができた時点でハーネスは待機します。別ターミナルで保存先のfirst-trial-check.jsonとtrials.jsonlを確認し、正常なら保存先にcontinueというファイルを作成すると残りが進みます。入力順→条件（新12は例示なし→あり）→各3回の順です。結果をモデル変更の効果や未知入力全般への有効性とは断定しません。14Bは採用未確定、CLI未接続です。

保存済み全応答の読み取り専用検証（Ollama接続なし）:

```bash
node docs/evidence/daily-extraction-few-shot-eval-2026-11-03/verify.mjs
```

評価結果は[結果文書](../../daily-extraction-few-shot-results-2026-11-03.md)を参照してください。14B＋3例は開発用の暫定候補で採用未確定です。CLI未接続、既存助言モデル・既定モデルは変更なしです。content-evaluation.jsonの推測入力の説明文訂正とanalyze.pyの対応箇所修正は結果文書に記録し、manifestへ反映しています。実行制御用continueマーカーは完了後に除去しています。
