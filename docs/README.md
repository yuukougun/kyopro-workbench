# docs

ライブラリ着手前の話し合い・決定事項・設計をまとめる場所。開発する道具の設計書は `dev/` に置く。

| ファイル | 内容 |
| --- | --- |
| [design.md](design.md) | 全体設計（構成・規約・cph展開との約束・テスト方針）。常に最新を書く |
| [catalog.md](catalog.md) | 欲しい機能のメモと一覧（思いついたら「メモ」に箇条書き） |
| [backlog.md](backlog.md) | 未決事項・アイデア・将来の改善 |
| [discussions/](discussions/) | 話し合いの記録（`YYYY-MM-DD_題名.md`） |
| [decisions/](decisions/) | 決定事項と理由（`NNNN-題名.md`） |
| [dev/](dev/) | 開発する道具の設計書（[review-tool/design.md](dev/review-tool/design.md): 精進支援のレビュー拡張と Claude 連携） |

## 運用ルール
- 話し合い → `discussions/` に記録 → 決まったら `decisions/` に残し、`design.md` / `catalog.md` に反映する。
- 細かい仕様（API・計算量・使用例）はライブラリのソースファイル冒頭コメントに書き、docs には重複させない。
- ファイルは必要になるまで分けない。1ファイルが長くなりすぎたら分割を検討する。
