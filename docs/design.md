# design.md

## 目的

`mental-auto` は、日々の短いメモを JST 基準で `logs/YYYY-MM-DD.md` にそろえて残すための CLI です。現時点では「まず確実に保存できること」を優先した最小構成です。

## 現在の設計

構成:

- CLI 本体: [src/index.ts](src/index.ts)
- 運用診断: [src/doctor.ts](src/doctor.ts)
- 共有前整形: [src/safe-share.ts](src/safe-share.ts)
- テスト: [test/index.test.ts](test/index.test.ts)

処理の流れ:

1. 引数を解釈する
2. 対象日を JST で決める、または `--date` で受ける
3. Markdown 本文を `# YYYY-MM-DD` 形式で作る
4. `logs/YYYY-MM-DD.md` へ書き込む

`mobile-inbox` import の処理:

1. `--import-mobile FILE_OR_DIR` を受ける
2. ファイル名 `YYYY-MM-DD.md` から日付を読む
3. 対応する `logs/YYYY-MM-DD.md` を開くか新規作成する
4. `## Mobile notes` セクションへ Markdown 本文を追記する
5. 取り込み元を `archive/` へ移動する
6. `--dry-run` では予定だけ表示し、書き込みと移動を行わない

`safe-share` の処理:

1. 入力を文字列または既存ファイルとして受ける
2. メールアドレス、API key らしき文字列、ローカルパスを最低限マスクする
3. 長すぎる行を省略する
4. 不要空白を整理して stdout に出す

`doctor` の処理:

1. Node.js version を確認する
2. `package.json` / `dist/` / `logs/` / `tsconfig.json` の存在を確認する
3. `dist/index.js` を見て build 済みか確認する
4. `logs/` 配下へ一時ファイルを書いて削除し、書き込み可能か確認する

## 設計判断

### JST 固定

- ローカル環境のタイムゾーン差で日付がずれないようにするため
- 日本語運用前提のログ用途と相性がよいため

### 1日1ファイル

- ファイル名だけで日付が分かる
- Git 差分や手動編集と相性がよい
- 集計や変換をあとから足しやすい

### mobile-inbox を別導線にする

- iPhone 由来の Markdown を PC 側の正本ログへ後から寄せたい
- 本文解析よりファイル名ベースの方が MVP として壊れにくい
- 取り込み後に archive へ移すことで再取り込みを避けやすい

### `## Mobile notes` セクションに寄せる

- 既存 PC メモと mobile 由来メモを見分けやすい
- same-day append を通常ログ保存へ導入せずに済む
- 既存ログ形式を大きく崩さず拡張できる

### same-day append を未採用

現状は上書きです。

理由:

- 仕様が単純
- 実装が短く、壊れにくい
- 追記形式にすると区切り、重複、時刻、整形ルールを先に決める必要がある

副作用:

- 同日再実行で前回内容が消える
- 1 日に複数回メモする運用には弱い

## `logs` と `mirror-logs`

### `logs`

- 実装済み
- 人間が読む Markdown 正本

### `mirror-logs`

- 未実装
- 将来、機械処理向けの派生データ置き場になる可能性はある
- ただし現時点では形式・保存契機・責務を確定していない

この段階では、README には「未実装」とだけ書くのが正しいです。

## 未実装オプションの扱い

以下は名前だけ存在しそうに見えるが、まだコード上の責務を持っていません。

- `--stats`
- `--advice`
- `--mirror-stats`
- `--mirror-advice`

今後追加するなら、先に決めるべき論点:

- 入力ソースは `logs` か `mirror-logs` か
- 標準出力に出すのか、ファイル生成するのか
- 期間指定が必要か
- advice の再現性をどう扱うか

## 将来の拡張方針

無理に一度に多機能化せず、次の順で広げるのが安全です。

1. same-day append の仕様確定
2. ログ読み出しの共通関数追加
3. `--stats` のような読み取り専用機能追加
4. `mirror-logs` の責務定義
5. `--advice` 系の生成機能追加
