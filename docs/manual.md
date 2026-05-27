# mental-auto 使い方

## 概要

mental-auto は、自由入力したメモをもとに日次ログを生成・蓄積する CLI ツールです。

目的：
- 日々の状態を記録する
- 継続しやすい形式で残す
- 集計や振り返りを行う
- 必要に応じて安全に共有する

---

## セットアップ

依存関係をインストール。

```bash
npm install
```

ビルド。

```bash
npm run build
```

テスト。

```bash
npm test
```

---

## 基本実行

通常実行。

```bash
node dist/index.js
```

入力内容をもとにログを生成する。

出力先：

```txt
logs/YYYY-MM-DD.md
```

---

## コマンド一覧

### 通常実行

```bash
node dist/index.js
```

日次ログを生成する。

---

### 統計表示

```bash
node dist/index.js --stats
```

直近データを集計して表示する。

---

### 行動提案

```bash
node dist/index.js --advice
```

記録内容を参考に短い提案を返す。

---

### 対話入力

```bash
node dist/index.js --interactive
```

CLI 上で対話形式入力を行う。

---

### mirror統計

```bash
node dist/index.js --mirror-stats
```

mirror-logs の集計を表示する。

対象例：
- stress
- fatigue
- focus
- exercise率

---

### mirror提案

```bash
node dist/index.js --mirror-advice
```

直近集計結果から今日の行動提案を1つ返す。

---

### 安全共有

```bash
node dist/index.js --safe-share
```

共有向けにテキストを整形する。

例：
- メールアドレス伏せ
- APIキーらしき文字列伏せ
- ローカルパス伏せ
- 長文整理

元データは変更しない。

---

## 出力先

ログ：

```txt
logs/
```

mirror：

```txt
mirror-logs/
```

---

## 注意事項

- 時刻基準は Asia/Tokyo
- 重要データは別保存推奨
- AI生成内容は最終確認する