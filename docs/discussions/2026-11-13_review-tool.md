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
