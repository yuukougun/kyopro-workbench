# 2026-11-13 精進支援ツールの設計書

## 話したこと
- このリポジトリに、AtCoder の精進を Claude との会話で支援する仕組み（レビュー拡張・Claude 用テンプレート）を加える。
- 利用者が書いた設計書（第7版）を Claude が確認し、修正案を出した。利用者の指示で、Claude の判断で第8版に書き直した。
- 開発の設計書なので、docs 直下ではなく `docs/dev/review-tool/design.md` に置く。

## 第7版からの主な変更（理由）
- 事実の修正（公式ドキュメントで確認）
  - WSL で使えないのはプラグインとファイル画面の編集で、`@` のファイル指定は使える。
  - `Edit` の禁止は `sed`・`tee`・リダイレクトにも効く。防げないのはスクリプト内のファイル操作。
  - サブフォルダの `.claude/skills/` は、そのフォルダのファイルを読むか編集するまで読み込まれない。
  - `settings.local.json` が自動で git の管理から外れるのは、Claude Code 自身が作った時だけ。
- atcoder.jp: Claude は自分からは開かず、利用者が明示した時だけ開く。テンプレートの settings.json には禁止を書かない（禁止は各自の許可で上書きできないため）。kyopro-atlas の方針・noai 指定と揃えるため。
- ライブラリの決定（0004・0005）を反映: includePaths は `lib/include`、CLAUDE.md に転送用ヘッダの読み方を書く。
- AC は利用者の申告で決める。`review.json` に進み具合（最高ヒント段階・AC・ギブアップ）を持たせ、記録の `support`・`status` の元にする。`/kp-review`・`/kp-giveup` は利用者だけが実行できるようにする。
- 指摘の ID を連番（`r1`…）にする。Claude は今の時刻を知るのに毎回承認が要るため。
- `last_test.json` は cph fork が書くのをやめ、fork はイベントを公開するだけ、書くのはレビュー拡張にする。fork とレビュー拡張の相互依存をなくすため。
- 指摘に行の内容（`anchor`）を持たせ、行のずれを検知する。
- `/record-problem` は `record_tool.py` 経由で `tools/ap.py` を呼ぶ（`ap.py` の絶対パスを `allowed-tools` に書けないため）。
- 肥大化を避けるため、スキル一覧パネルは作らず、メモタブ・過去の記録の表示・コンテストモードは後回しにする。
- install.sh は「差分を表示して飛ばす、`--force` で上書き」にし、`--link` を加える。vsix は GitHub Releases で配る。
- 記録形式 v2 の3項目（support・status・code）はすべて採用する。

## 次回
- 第8版を利用者が確認し、違うところを直す。

---

## 第8版への利用者の回答 → 第9版
- 同じリポジトリに入れる。ライセンスは最も緩いもの → CC0-1.0（cph fork は GPL-3.0-or-later、本家を明示）→ decisions/0006
- ヒントは緩める: 段階を指定されなくても、進めない様子なら Claude の判断で Lv3 まで1段ずつ上げてよい。解答は従来どおり AC 申告かギブアップの後だけ。
- 後回しにした機能（スキル一覧パネルも含む）は、最初の実装を使ってから必要なものを足す。
- 記録形式 v2 の3項目は入れてよい。kyopro-atlas の別作業が進行中なので、着手は利用者の指示を待つ。
- 原因の4分類とヒント段階の対応は kyopro-atlas の定義に従う。
- 名前はライブラリと揃えず、一般的な規則で付ける → 拡張 `yuukougun.atcoder-review`、設定 `atcoderReview`、フォルダ `.atcoder-review/`、スキル `coach-*`。
- 未決として残したもの: 「明示」の範囲、vsix の配り方、README の言語、cph fork の拡張 ID。

---

## 第9版への利用者の回答 → 第10版
- 「明示」の範囲: 公開するテンプレートの既定は狭いまま。自分の環境では広くする → 各自の `CLAUDE.local.md` で広げられるようにした（install.sh は触れない）。
- vsix はリポジトリに入れる。
- テンプレートはコピーで置く → install.sh の `--link` はやめた（使わない機能を持たない）。
- README は日本語。
- リポジトリの名前は変える（候補を出して選んでもらう）。
- cph fork の拡張 ID は一般的なやり方に従う → 自分の ID（`yuukougun.cph-fork`）にする。設定とコマンド（`cph.*`）は本家のままにし、本家を無効にして入れ替えて使う。
- リポジトリの名前は `kyopro-workbench` に決定（kyopro-atlas と名前を揃え、「教材」と「作業環境」の役割分担を表す）→ 第11版。GitHub 上の変更はフェーズ0で、利用者の指示を受けてから行う。

---

## kyopro-atlas のセッションとの相談（/record-problem の変更）→ 第12版
- 案1（record_tool.py に root・ap を足し、${CLAUDE_SKILL_DIR} 経由で呼ぶ）は合意。追加: ap は show・contest・fetch だけ通す、record-format.md も root 基準で読む、作業フォルダが外にある人向けに additionalDirectories の案内、PyYAML の注意。
- support の値は kyopro-atlas の言葉に合わせ `自力`・`ヒントだけ`・`解説まで`・`ギブアップ`（「解説」だけだと公式解説と区別できないため）。status は記録1件ごと。code はただの文字列。v1 の記録も通す。
- /record-problem の中では作業フォルダから呼ばれても atcoder.jp を開かない。開いて得た文章を notes/ に写さない。
- kyopro-atlas の CLAUDE.md に「外のセッションから読み込まれた時」の注意を足す案は、kyopro-atlas のセッションが利用者に確かめてから入れる。
- 実装は kyopro-atlas のセッションが行い PR を出す。作業フォルダ側からの動作確認はこちらが受け持つ（/record-problem は利用者が打つ必要がある）。

---

## 実装（フェーズ0〜3）→ 第13版
- GitHub のリポジトリ名を kyopro-workbench に変え、説明文も更新した。
- cph fork: 本家 ef8c7a7 に元のパッチがそのまま当たることを確かめ、拡張 ID の変更（yuukougun.cph-fork）とテスト結果のイベント（onDidRunTests）を足した。本家の試験 70 件は通過。vsce は `--no-dependencies` が要る（本家のリリース手順と同じ）。
- 本家の package.json の版は元から 2077.0.0 だった（以前「本家の更新で上書きされないための版」と説明したのは誤り）。
- レビュー拡張: 単体テスト 14 件と、vscode をまねた簡易な動作確認で、context.json・指摘の表示・対処済み・行のずれ・last_test.json を確かめた。実際の VSCode での確認は利用者に頼む。
- 実装で設計から変えた点: last_test.json の compile.message はやめた（fork がコンパイルエラーの内容を渡さないため）、stderr を足した。添削の指摘は hintLevel 0。パネルはアクティビティバーに置く。
- 権限ルールは公式ドキュメントに合わせ、書き込み許可を `Edit(/.atcoder-review/**)`（作業フォルダ基準）、編集禁止を `Edit(//**/*.cpp)` など（全体）にした。
- 気づいた問題: Claude Code は起動フォルダより上の CLAUDE.md も読むので、作業フォルダに置いたコーチ用の CLAUDE.md が、その下の lib・kyopro-atlas で起動したセッションにも効いてしまう → テンプレートの冒頭に「下のフォルダで起動したセッションでは従わない」を足した（第14版）。
