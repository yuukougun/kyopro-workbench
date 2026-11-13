# AtCoder Review

AtCoder の過去問精進で、Claude Code との連絡に使うファイルを読み書きする VSCode 拡張です。この拡張自身は Claude を呼びません。設計は [docs/dev/review-tool/design.md](../../docs/dev/review-tool/design.md) にあります。

## できること

- **今の状態の書き出し**：開いているファイル、選択範囲、cph で取り込んだ問題を `.atcoder-review/context.json` に書き出します。Claude Code に「ここ見て」と言うと、Claude がこれを読みます。
- **テスト結果の書き出し**：[cph fork](../cph-fork/) でサンプルを実行すると、結果を問題ごとの `last_test.json` に書き出します（cph fork が入っている時だけ）。
- **パネル**：アクティビティバーの「AtCoder Review」に、使ったヒントの段階・AC・ギブアップと、Claude が書いた項目を種類ごと（誤り・誤りの可能性・ヒント・改善・別解・ライブラリ化の候補）に出します。
  - 見出しをクリックすると、本文（`<id>.md`）を開閉できます。初期状態は閉じています。「すべて開く」「すべて閉じる」もあります。
  - 本文は Markdown で、表・C++ の色分け・数式・囲み（`> [!NOTE]` など）・マーカー・意味の決まった色を表示できます。
  - 図などの `<id>.html` があれば「HTML を開く」ボタンが出て、エディタのタブに表示します。
  - 行番号をクリックするとその行へ移動して強調し、チェックで「対処済み」にできます（`review_state.json` に記録）。
- **エディタ上の表示**：コードには文字を重ねず、ガターに種類ごとの色のアイコンだけを出します。カーソルを指摘のある行に置くと、パネルの側でその項目を強調します。
- **行の追従**：コードを直して行がずれても、指摘を書いた時の行の内容を手がかりに、近くの同じ行へ表示を移します。見つからなければ、アイコンを出さずにパネルに「見失った」と出します（`}` のようなありふれた行は追従しません）。

パネルは、アクティビティバーのアイコンをドラッグすると、右側（セカンダリサイドバー）にも置けます。

## インストール

VSCode のコマンドパレットで「Extensions: Install from VSIX...」を選び、このフォルダの `atcoder-review.vsix` を選びます。Claude Code 側の準備は、リポジトリの [README](../../README.md) を見てください。

## 設定

| 設定 | 既定値 | 内容 |
| --- | --- | --- |
| `atcoderReview.root` | `${workspaceFolder}/.atcoder-review` | `context.json` を置くフォルダ |
| `atcoderReview.problemDirectory` | `${root}/${contest}/${index}` | 問題ごとのファイル（`review.json` など）を置くフォルダ |
| `atcoderReview.atlasPath` | （空） | kyopro-atlas の場所。設定した時だけ Claude が教材との連携を使う |

`root` を変えた時は、作業フォルダの `.claude/settings.json` の書き込み許可（`Edit(/.atcoder-review/**)`）も合わせて変えてください。

## ファイル

| ファイル | 書き手 | 内容 |
| --- | --- | --- |
| `context.json` | この拡張 | 今の状態（ファイル・選択範囲・問題・ライブラリの場所など） |
| `<問題>/last_test.json` | この拡張 | cph fork のテスト結果（AC 以外のケースだけ入出力つき） |
| `<問題>/review.json` | Claude | 項目の一覧と進み具合 |
| `<問題>/<id>.md`・`<id>.html` | Claude | 項目の本文と、図などの HTML |
| `<問題>/review_state.json` | この拡張 | 「対処済み」にした指摘 |

`review.json` が壊れている（JSON として読めない）時は、パネルにエラーを出し、直前に読めた内容を表示し続けます。

## 開発

```sh
npm ci
npm test       # 型チェック、パネルのスクリプトのまとめ（media/panel.js）、単体テスト（tests/）
npm run package  # テストのあと atcoder-review.vsix を作る
```

ソースを直したら、作り直した `atcoder-review.vsix` も一緒にコミットします。
