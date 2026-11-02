# Qwen3 14B 初回動作確認（2026-11-02）

AGENTS.md確認済み。取得前空き336GiB、取得後328GiB。`ollama pull qwen3:14b-q4_K_M` はSHA-256検証・manifest保存を完了しexit 0。

モデル: qwen3:14b-q4_K_M / 14.8B / Q4_K_M / 9276198565 bytes。
digest: `bdbd181c33f2ed1b31c972991882db3cf4d192569092138a7d29e973cd9debe8`。
サーバー 0.40.13、Node v25.8.2、Apple M4 / 32GB。
既定パラメータ（api/show）:
```
top_k                          20
top_p                          0.95
repeat_penalty                 1
stop                           "<|im_start|>"
stop                           "<|im_end|>"
temperature                    0.6
```

temperatureのみ0に上書き。think:false、stream:false、seed未指定、マスクなし。未指定のモデル既定値は上記のまま。既存qwen3.5:9bのdigestを前回記録と照合し保持を確認。既定モデルを変更していない。

現作業ツリーを外部ビルドし内部providerを直接import。CLI未接続。ソース実体はsnapshot/src、生成物はbuild、ハッシュはhashes.json、HEADと未コミット差分はcommit.txtとworktree.diffに保存。
前回scope-evalのD-2026-10-03と入力・プロンプト・Schema・設定がmodel名以外同一であることを送信前assert。全文と送信内容はinput.jsonとrequest-preview.json、実際の送信はtrials/D-2026-10-03-1/request-body.txtに保存。ダミーの記録・読み戻し検証はdummyへ分離した。

実試行は1回のみ、再試行なし。HTTP 200、機械検証1成功・0失敗。所要10.346秒（初回ロード込み、記録処理を含む）。Ollama total_duration 10.338秒、load 2.035秒、prompt_eval 6.109秒、eval 2.174秒。
生のモデル本文:
```json
[{"quote":"原因を全部洗い出して、納得するまで考えたい。","kind":"wish"}]
```
検証後配列はtrialのvalidated.jsonにローカルID・日付付きで保存。全文wishでaction混入なしという暫定所見。1回の動作確認であり、品質改善・モデル優劣・再現性・未知入力への有効性は未確定。後続比較では、この固定条件・digest・ソースのD-2026-10-03の1回目として算入可能。

メモリは実行前後と約1秒間隔、計12時点をmemory-samples.jsonに保存。全観測時点でswap使用0。runnerの観測最大RSS 14459280 KiB（約13.79GiB）。Ollama api/psはsizeとsize_vramをともに13806914763 bytes（約13.81GB）と報告、実効context 32768。これらは共有メモリ環境で加算できず、厳密な最大値やOS全体のメモリ必要量ではない。

送受信記録の読み戻し照合済み。作業前後git status一致。リポジトリ内ファイル、実装、プロンプト、期待値を変更せず、コミット・push未実施。過去記録は保持。
