# docs

ライブラリ着手前の話し合い・決定事項・設計をまとめる場所。

| ファイル | 内容 |
| --- | --- |
| [design.md](design.md) | 全体設計（構成・規約・cph展開との約束・テスト方針）。常に最新を書く |
| [catalog.md](catalog.md) | 作る機能の一覧と優先度・状態 |
| [backlog.md](backlog.md) | 未決事項・アイデア・将来の改善 |
| [discussions/](discussions/) | 話し合いの記録（`YYYY-MM-DD_題名.md`） |
| [decisions/](decisions/) | 決定事項と理由（`NNNN-題名.md`） |

## 運用ルール
- 話し合い → `discussions/` に記録 → 決まったら `decisions/` に残し、`design.md` / `catalog.md` に反映する。
- 細かい仕様（API・計算量・使用例）はライブラリのソースファイル冒頭コメントに書き、docs には重複させない。
- ファイルは必要になるまで分けない。1ファイルが長くなりすぎたら分割を検討する。
