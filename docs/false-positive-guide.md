# False Positive Guide

誤検知が出たときは、まず検知が本当に公開してよい内容かを確認してから `allowlist` を追加します。

## 手順

1. ターミナル、Markdown、または JSON レポートで対象の `filePath` と `ruleId` を確認します。
2. 誤検知の原因がファイル単位なら `allowlist.paths` を使います。
3. 誤検知の原因が特定の固定文字列なら `allowlist.patterns` を使います。
4. 設定後に再度 `security-checker` を実行し、意図した検知だけが抑制されることを確認します。

## `allowlist.paths` の例

```json
{
  "allowlist": {
    "paths": [
      { "pattern": "test/fixtures/*", "matchType": "glob" },
      { "pattern": "src/examples/.*\\.txt$", "matchType": "regex" }
    ],
    "pathPatternCombination": "OR",
    "patterns": []
  }
}
```

- `glob` は `test/fixtures/*` のようなパス向けです。
- `regex` はより細かい条件を付けたいときに使います。
- `pathPatternCombination` を `AND` にすると、`paths` 内の全条件に一致した場合だけ除外されます。

## `allowlist.patterns` の例

```json
{
  "allowlist": {
    "paths": [],
    "pathPatternCombination": "OR",
    "patterns": ["example@email.com", "YOUR_API_KEY"]
  }
}
```

- `patterns` は検出メッセージや抜粋テキストに対して評価されます。
- ファイルパスだけを理由に抑制したい場合は `patterns` ではなく `paths` を使ってください。

## 追加時の注意

- `allowlist` は `SAFE > BLOCK > REVIEW` の優先順位で最優先です。
- 本物の秘密情報を `allowlist` しないでください。
- `.env.example` のようなテンプレートでも、実値が入っていれば別ルールで検知されることがあります。
