---
name: coach-review
description: AC を申告し、今の解答の添削と別解を受ける。この後は解答コードや解説も見られる。
disable-model-invocation: true
---

# AC 後の添削

利用者が AC したことを申告した。添削と別解を出す。

## 手順

1. `.atcoder-review/context.json` を読み、問題とファイルを確かめる。`dirty` が `true` なら保存を頼んで止まる。
2. `problemDir` の `review.json` の `progress.accepted` を `true` にする（ファイルがなければ作る）。
3. ソースを読み、添削する。
   - 正しさや計算量に関わる危うい所（たまたま通っている所など）
   - 読みやすさ・書きやすさの改善（ライブラリにできそうな部分も含む）
   - それぞれ `review.json` の項目として書く（CLAUDE.md の「指摘の書き方」）。`kind` は危うい所なら `risk`、改善なら `improve`、ライブラリにしておくと便利な処理なら `library`。`hintLevel` は書かない。説明は `<id>.md` に書いてよい。
4. 別解があれば、`kind` が `alt` の項目にし、考え方と計算量を `<id>.md` に書く。求められたらコードも書いてよい。図が要れば `<id>.html` も使える。
5. チャットでは、書いた項目の一覧（ID と見出し）だけを伝える。
6. ヒントや解説を使っていれば（`progress.maxHint` が 1 以上か、会話でそうしていれば）、最後に原因を4つから1つ添える（CLAUDE.md の「原因の一言」）。自力で AC したなら添えない。
7. kyopro-atlas と連携していれば（`env.atlasPath` がある）、記録したい時は `/record-problem` を使えることを一言伝える。
