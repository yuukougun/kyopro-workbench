---
name: coach-hint
description: 今の問題のヒントを段階（1〜3）を指定して出す。段階を省くと今の段階から判断する。指摘はエディタに表示される。
argument-hint: "[段階 1〜3]"
---

# ヒントを出す

CLAUDE.md の「ヒントの段階」に従って、今の問題のヒントを出す。

## 手順

1. `.atcoder-review/context.json` を読み、問題・ファイル・見てほしい行を確かめる。`dirty` が `true` なら保存を頼んで止まる。`context.json` がなければ、どの問題のどこかを聞く。
2. `problemDir` の `review.json` と `review_state.json` があれば読む。`progress.maxHint` が今の段階。
3. 段階を決める。
   - 引数で段階を指定されたら、その段階にする（解答は出さない。解答は `/coach-review` か `/coach-giveup` の後だけ）。
   - 指定がなければ、今の段階（なければ Lv1）。前のヒントで進めていない様子なら、1段だけ上げてよい（Lv3 まで）。上げる時は一言添える。
4. 問題文が手元になければ、スクリーンショットか要約を頼む（atcoder.jp は自分からは開かない）。サンプルは `problem.probFile` から読む。
5. ソースを読み、その段階で言ってよい範囲でヒントを出す。
6. コードの特定の行についての指摘があれば、`review.json` に追加・更新する（CLAUDE.md の「review.json の書き方」）。`progress.maxHint` を今回の段階まで上げる。

ヒントは短く、1つの気づきに絞る。答えや直したコードは書かない。

## 入力

$ARGUMENTS
