# 3例追加版の評価用設定（2026-11-03 JST）

提案済みの3例（身体行動と知覚、実行済み思考行動、複数節の希望）を追加したプロンプトを固定した記録です。固定時点では新12入力は未作成・実生成未評価でした。その後の[165試行の評価](../../daily-extraction-few-shot-results-2026-11-03.md)では、既存31入力が全件・全3回合格、新12入力は9入力が全3回合格、3入力に問題が残りました。14B＋3例は開発用の暫定候補で採用未確定です。CLI未接続、既存助言モデル・既定モデルは変更なしです。frozen.jsonのstatusは固定時点の記録として維持します。

[frozen.json](frozen.json)にsystemプロンプト本文、Schema、生成設定（stream:false、think:false、temperature:0）、モデル名・必要digest、SHA-256を保存しています。seedとその他の生成オプションは従来どおり未指定です。モデルdigestは前回記録からの必要条件で、今回はOllamaへ問い合わせていません。実行時にはdigestとapi/showの既定値を前回14B評価に照合してください。

ハッシュ対象はsystemプロンプトのUTF-8バイト列（末尾改行なし）、Schemaと生成設定のJSON.stringifyによるコンパクトJSON（キー順を維持）です。固定JSONファイル自体のハッシュとは区別します。

|対象|SHA-256|
|---|---|
|systemPrompt|`848a59b2d531c4306dddb34fcd9f468d749aa9eb36da897d3103efb74cf20a2d`|
|schema|`ab5dc580511e136269d809dcc2852a2a291f7bcbedeba9108ae465600ad07ac7`|
|generationSettings|`59bbcb15e70d31a1fc057d049697747689589835271c7f7ecf522411e90b10f4`|

ソース・生成物のファイルハッシュもfrozen.jsonに記録しています。固定内容とビルド済みの内部リクエスト構築関数の一致は、次の手順で再現できます。リポジトリのルートで実行してください。Ollamaへの通信は発生せず、CLIから抽出処理を呼び出す変更もありません。

```bash
eval_build_dir=$(mktemp -d /private/tmp/mental-auto-three-examples.XXXXXX)
printf '{"type":"module"}\n' > "$eval_build_dir/package.json"
./node_modules/.bin/tsc -p tsconfig.json --outDir "$eval_build_dir/build"
node docs/evidence/daily-extraction-three-examples-2026-11-03/verify.mjs "$eval_build_dir/build/index.js"
```

verify.mjsは読み取り専用です。空本文はリクエスト構築関数を検査するためだけに使用し、新しい評価入力として保存・生成評価しません。入力を決めた後の送信userメッセージは、既存どおり `JSON.stringify({ content: 入力全文 })` です。マスクなしで評価する条件を固定しています。

[例示なしの判断順変更評価](../../daily-extraction-decision-order-14b-results-2026-11-03.md)は、今回の評価では改善なしでした。既存21入力は改善0・悪化0・維持21。20入力はモデル本文が前回と一致し、1入力は末尾句点のみの差でした。未知入力でも無効とは断定しません。

評価では既存31入力を回帰系列とし、別の12入力をプロンプト確定後に作成して実行前に全文・期待配列・判定基準・ハッシュを固定しました。新系列は例示なし・ありを比較し、回帰結果と分けています。今回の単体テストは例示の送信指示への包含、固定設定・ハッシュ、例示の構造・引用一致を確認するもので、実モデルの品質改善の証拠ではありません。
