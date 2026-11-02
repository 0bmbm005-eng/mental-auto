# coding: utf-8
from pathlib import Path
import json,hashlib
repo=Path('/Users/kei/projects/mental-auto');out=repo/'docs/evidence/daily-extraction-qwen3-14b-2026-11-02';a=json.loads((out/'records.json').read_text());s=a['summary'];h=a['hashes'];b=json.loads((repo/'docs/evidence/daily-extraction-scope-eval-2026-11-02/records.json').read_text());model=a['environment']['tags']['models'];model=next(x for x in model if x['name']=='qwen3:14b-q4_K_M')
text='''# Qwen3 14BとQwen3.5 9Bの日次抽出比較（2026-11-02 JST）

**固定21入力では、Qwen3 14BはDの分断・希望の行動化など7入力を改善した一方、A初日・D初日・追加混在文の3入力で分類が悪化した。全面的な置き換えの根拠にはしない。** 内容評価はCodexによる暫定判定で、人間による確定評価ではない。

## 条件と比較範囲

AGENTS.md確認済み。Apple M4・32GB、Node.js v25.8.2、Ollamaサーバー0.40.13。HEAD `e5b7aa9a4f9adb306efa93e836e5a8f601ca39b2` に未コミットの分類・引用単位整理を加えた実装を使用。[Qwen3.5 9Bの同じ修正版63試行](daily-extraction-scope-eval-2026-11-02.md)と比較した。

- Qwen3: `qwen3:14b-q4_K_M`、14.8B、Q4_K_M、9,276,198,565 bytes。
- digest: `bdbd181c33f2ed1b31c972991882db3cf4d192569092138a7d29e973cd9debe8`。初回確認・今回開始・終了時で一致。
- 比較対象: `qwen3.5:9b`、9.7B、Q4_K_M、digest `c97eb11d70b1acdc88af01eef566c1fe4f7fbe93eb1afc06871132f293ff425a`。今回も保持を確認。
- `/api/chat`、マスクなし、temperature:0、think:false、stream:false、seed未指定。
- 既存12入力と追加9入力の全文・SHA-256、プロンプト・Schema・期待値を固定。全21入力で、保存済み9Bのリクエストとモデル名以外が構造的に一致することを送信前に照合した。
- 追加9入力は設計時に参照済み。未知入力への有効性を確認したとはしない。実ログは使用していない。

**送信フィールドの一致と実効条件の完全一致は異なる。** モデル固有のテンプレート・トークナイザ・既定パラメータ・実行系が異なる。14Bのapi/showはtop_k:20、top_p:0.95、repeat_penalty:1、temperature:0.6、stop:`<|im_start|>`と`<|im_end|>`。9Bはtop_k:20、top_p:0.95、presence_penalty:1.5、temperature:1。temperatureは両者0に上書きしたが、他の未指定値を揃える変更はしていない。9Bの既定値は今回取得した同digestのapi/showで確認し、過去試行時の実効全設定を遡って観測したものではない。比較結果をモデルの重みだけの効果とは断定しない。

## 初回確認の算入と実行

初回確認 `D-2026-10-03-1` の入力・実送信・モデルdigest・ソース・生成物ハッシュが一致したため1回目として算入した。その記録を変更せず `initial-smoke/` に丸ごと保存し、比較用trialsにもコピーした。残り62試行を1件ずつ逐次実行。追加の推論・再試行・失敗の上書きなし。送信なしのダミー検証と最初の1試行の記録・解析・検証成功は初回記録に残っている。

初回確認で現作業ツリーから外部ビルドした生成物を再利用し、今回開始前・各試行前・終了後にソースと外部生成物を照合した。同じ修正版の9B評価時とも一致。CLIには接続していない。

|対象|SHA-256|
|---|---|
'''
for k in ['src/index.ts','build/index.js','test/fixtures/daily-extraction-scope-expectations.json']:text+=f'|{k}|`{h[k]}`|\n'
text+=f"|systemプロンプト|`{a['inputs'][0]['promptSha256']}`|\n"
text+='''
全入力のハッシュと全文はrecords.json、Schema・プロンプト全文は各requestBodyに保存。例としてD・10/03の入力SHA-256は `0a264ac31a4018cf3caf4c49d9d1f73198f3946d2e5aa72ac7ca0efdef9971c5`。

README・design・tasksは9B評価記録時点から文書更新があるが、比較に使ったソース・生成物・入力・期待値は一致している。準備時に文書まで同一とする広すぎるassertを修正した記録はpreparation-note.jsonへ残した。この時点では追加のOllama推論は行っていない。

## 機械検証と内容評価

機械検証は既存providerによる構造・型・引用の完全一致確認。意味分類・十分な引用範囲とは分ける。各応答で内容問題が一つでもあれば問題1試行と数える。3回の繰り返しを独立した異なる入力と見なさない。

|モデル・系列|異なる入力数|試行数|機械成功／失敗|内容基準を満たす試行|内容問題の試行|内容問題の異なる入力数|
|---|---:|---:|---|---:|---:|---:|
|9B・既存|12|36|36／0|30|6|2|
|14B・既存|12|36|36／0|30|6|2|
|9B・追加|9|27|27／0|12|15|5|
|14B・追加|9|27|27／0|24|3|1|
|9B・合計|21|63|63／0|42|21|7|
|14B・合計|21|63|63／0|54|9|3|

HTTPは今回も全63件200。入力単位では、基準を満たす入力が9Bの14/21から14Bの18/21へ変化。改善7入力・悪化3入力・維持11入力。既存系列は問題数が同じでも、問題の入力が入れ替わっている。

## 入力別の比較（すべて暫定）

以下の判定は各入力の3回とも同じ。句点の除外や末尾接続助詞の残存は意味範囲を保つ場合に許容し、対象・時間・述語の分断とは区別した。

|系列・入力|9B→14B|14Bの内容評価|
|---|---|---|
'''
labels={'improved':'問題→基準を満たす','regressed':'基準を満たす→問題','maintained':'維持'}
for g in s['groups']:text+=f"|{g['series']} / {g['inputId']}|{labels[g['change']]}|{g['reason']}|\n"
text+='''
A初日は原文の行動部分自体が消えたわけではないが、そのaction分類と観察との分離を失った。推測と否定は残る。Aの他2日は維持し、自己評価の句点除外は意味を損なわない。Bの読書・散歩の時間情報、Cの3日分の行動抽出も維持した。

D・10/02は対象・時間・述語を全文actionとして保持し、10/03は全文wishとなってaction混入を解消した。ただしD・10/01の実行済み思考行動をobservationとする新たな誤分類がある。D全体や一般化問題が解決したとはしない。

追加9入力では、以前問題だった思考行動・希望・予定・不実施・否定された推測の5入力が改善。推測・実行済み行動と希望の併記・短い行動は維持。一方、混在文は行動と観察を一括observationとし悪化した。範囲保持を優先したことが分割不足と関係する可能性はあるが、原因を確定する証拠ではない。

## 代表出力の前後比較

全21入力の全文・全63応答はrecords.jsonに保存。以下は注目入力の代表出力（quote・kind）で、当該モデルの3回とも同じ。

'''
for key in ['A-2026-10-01','D-2026-10-01','D-2026-10-02','D-2026-10-03','wish-scope','negated-inference','mixed-statements']:
 g=next(g for g in s['groups'] if g['inputId']==key);x=next(x for x in a['inputs'] if x['inputId']==key)
 text+=f"### {key}\n\n入力全文（JSON文字列）:\n\n```json\n{json.dumps(x['content'],ensure_ascii=False)}\n```\n\n9B:\n\n```json\n{json.dumps(g['previousRepresentative'],ensure_ascii=False,indent=2)}\n```\n\n14B:\n\n```json\n{json.dumps(g['representative'],ensure_ascii=False,indent=2)}\n```\n\n"
text+='''## 3回のばらつき

両モデルとも既存12/12組・追加9/9組でmessage.contentが各3回バイト一致。14BのD・10/03も先ほどの初回確認と今回の2回が一致。解析後のquote・kind・順序も一致し、意味も一致した（暫定）。生のHTTP応答全体には日時や所要時間の差があり、モデル本文一致とは区別する。誤分類も3回再現しており、安定性は妥当性を意味しない。

## 所要時間とメモリ

所要時間は記録処理を含むprovider呼び出し時間。初回確認は別の時間帯で、取得待ちや試行間の間隔を合計に含めない。後続62件の計測では約1秒間隔のメモリ採取処理も同時実行しており、厳密な速度ベンチマークではない。

|対象|試行所要時間の合計|中央値|最小|最大|
|---|---:|---:|---:|---:|
'''
for label,k in [('9B・63件','baselineTiming63'),('14B・初回算入の63件','timing63'),('14B・今回追加62件','timingNew62')]:
 t=s[k];text+=f"|{label}|{t['sumSeconds']:.3f}秒|{t['medianSeconds']:.3f}秒|{t['minSeconds']:.3f}秒|{t['maxSeconds']:.3f}秒|\n"
first=json.loads((out/'initial-smoke/trials/D-2026-10-03-1/result.json').read_text());new=[t['result'] for x in a['inputs'] for t in x['trials'] if not t['reusedSmoke']]
text+=f"\n初回確認: {first['started']}（UTC）。今回62件: {min(x['started'] for x in new)}〜{max(x['finished'] for x in new)}（UTC）。14Bは合計が短いが中央値は近く、出力長・キャッシュ・初回ロード・モデル既定値も異なるため、速度向上は保証しない。\n\n"
m=s['memoryNew62'];text+=f"今回62件は{m['sampleCount']}時点、初回確認は12時点の観測で、すべてswap使用量0。runnerの今回観測最大RSSは{m['runnerMaxObservedRssKiB']:,}KiB（約{m['runnerMaxObservedRssKiB']/1024**2:.2f}GiB）。Ollama api/psの実行後size・size_vramはいずれも13,806,914,763 bytes（約13.81GB）、実効context_lengthは32768。これはサンプル時点の値で厳密なピーク・必要メモリ・OS全体の使用量ではなく、共有メモリ上の値同士を加算できない。9Bの同種観測がないためメモリ優劣は比較しない。\n"
text+='''
## 保存内容と限界

[記録ディレクトリ](evidence/daily-extraction-qwen3-14b-2026-11-02/)に以下を保存した。

- [records.json](evidence/daily-extraction-qwen3-14b-2026-11-02/records.json): 21入力全文とハッシュ、63件の送信全文・HTTP応答・モデル本文・検証後配列・結果・時間。
- [content-evaluation.json](evidence/daily-extraction-qwen3-14b-2026-11-02/content-evaluation.json): 全63件の暫定内容判定と理由。[summary.json](evidence/daily-extraction-qwen3-14b-2026-11-02/summary.json): 集計・入力別比較・ばらつき。
- expectations.json: 固定fixtureのバイトコピー。snapshot/src・build: 使用ソースと生成物。hashes.json、worktree.diff、status-before.txt: ハッシュ・HEADとの差分・実行前状態。
- initial-smoke/: 初回確認を記録一式・ダミー検証・メモリ観測を含めて保存。trials/: 全63件の個別記録。
- environment.json・final-environment.json・baseline-show-current.json: バージョン・モデルdigest・既定値・稼働状況。baseline-local-model-metadata.jsonは補助的なローカルmanifest記録で、そのファイルハッシュをAPIのモデルdigestと同一視していない。
- memory-samples.json、run.mjs、archive-report.py: 観測値と履歴スクリプト。スクリプトは当時の絶対パスを含む。manifest-sha256.jsonで保存物の整合性を確認できる。過去記録は上書きしていない。

追試は新規保存先を使い、records.jsonの本文・プロンプト・Schema・生成設定、expectations.json、モデルdigest、使用ソース・生成物を固定する。今回の初回確認1件はすでに63件に算入済みで、重ねて数えない。

日次抽出の既知入力で得られた結果であり、未知入力への一般化・複数日の要約・助言生成・CLI統合は未検証。次は希望範囲の保持と、独立した行動・観察の分割、実行済み思考行動のaction分類が同時に成立するかを、人間の判定と設計未参照の別入力で確認する候補になる。今回は期待値・実装・プロンプトを変更せず、既定モデル変更・モデル削除・コミット・pushも行っていない。

実装変更がないためテスト・ビルドを再実行する代わりに、固定ハッシュ、全63件の機械検証、送受信記録の読み戻し、3回分の集計、保存先リンクとmanifestを確認した。リポジトリ内distは変更していない。
'''
(repo/'docs/daily-extraction-qwen3-14b-comparison-2026-11-02.md').write_text(text)
