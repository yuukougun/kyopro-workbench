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
6. ヒントを `review.json` の項目として書く（CLAUDE.md の「指摘の書き方」）。特定の行の話なら `line` と `anchor` を付け、`kind` は `hint`（誤りを見つけた時は `bug` か `risk`）、`hintLevel` は今回の段階。説明が見出しに収まらなければ `<id>.md` に書く。`progress.maxHint` を今回の段階まで上げる。
7. チャットでは、どの項目に書いたかと一言の要約だけを伝える。

ヒントは1つの気づきに絞る。答えや直したコードは書かない。

## 入力

$ARGUMENTS
