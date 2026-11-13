# cph fork

[Competitive Programming Helper (cph)](https://github.com/agrawal-d/competitive-programming-helper) を改造した VSCode 拡張です。

- 本家: https://github.com/agrawal-d/competitive-programming-helper （作者 Divyanshu Agrawal）
- パッチの元にした版: コミット `ef8c7a70a7beff150bf5ed5e5ad8c631539a3fd6`（2026-10-16）
- ライセンス: GPL-3.0-or-later（本家に従う。[LICENSE](LICENSE)）
- 拡張の ID: `yuukougun.cph-fork`（本家は `DivyanshuAgrawal.competitive-programming-helper`）

## 本家から変えたところ

| 機能 | 内容 |
| --- | --- |
| 提出用にコピー | `#include "..."` を再帰的に展開してクリップボードにコピーする。同じファイルは1回だけ展開し、`// @impl` より下は main の後ろにまとめる |
| 問題ファイルの置き場所 | Competitive Companion から取り込んだ問題のフォルダとファイル名を、変数（`${contest}` `${index}` など）で決められる |
| 表示の簡素化 | パネルのボタンなどを減らす表示 |
| テスト結果の通知 | テストの実行が終わったら、結果を他の拡張に知らせる（下記） |

追加した設定は、すべて説明の先頭に `[fork]` と付いています。

| 設定 | 内容 |
| --- | --- |
| `cph.general.problemDirectory` | 問題ファイルを作るフォルダ |
| `cph.general.problemFileName` | 問題ファイル名（拡張子なし） |
| `cph.bundle.includePaths` | 「提出用にコピー」で `#include "..."` を探すフォルダ |
| `cph.bundle.implMarker` | main の後ろへ移す部分の目印（既定は `// @impl`） |
| `cph.ui.minimal` | パネルの表示を簡素にする |

設定とコマンドの名前（`cph.*`）は本家のままです。そのため本家と同時には使えません。

## インストール

1. 本家の cph が入っていれば、無効にするかアンインストールする。
2. VSCode のコマンドパレットで「Extensions: Install from VSIX...」を選び、このフォルダの `cph-fork.vsix` を選ぶ。

## テスト結果の通知（他の拡張から使う）

`activate()` の戻り値で、テスト結果のイベント `onDidRunTests` を公開しています。この拡張自身はファイルを書きません。

```ts
const ext = vscode.extensions.getExtension('yuukougun.cph-fork');
const api = await ext?.activate();
api?.onDidRunTests((e) => {
    // e.srcPath, e.url, e.compile.ok, e.cases[{ id, pass, timeMs, timeOut, code, signal, input, expected, stdout, stderr }]
});
```

- 全ケースを実行した時は、全ケースが終わってから1回だけ通知します。
- 1ケースだけ実行した時は、そのケースだけを通知します。
- コンパイルに失敗した時は、`compile.ok` が `false`、`cases` が空で通知します。

型は `src/testEvents.ts`（パッチ内）にあります。

## ビルド

```sh
git clone https://github.com/agrawal-d/competitive-programming-helper.git
cd competitive-programming-helper
git checkout ef8c7a70a7beff150bf5ed5e5ad8c631539a3fd6
git apply <このフォルダ>/cph-fork.patch
npm ci
npm test
npx @vscode/vsce package --no-dependencies --allow-star-activation -o cph-fork.vsix
```

依存関係は webpack でまとめているので、`--no-dependencies` を付けます（本家のリリース手順と同じ）。

パッチを直した時は、上の手順で作った作業ツリーで変更し、`git add -A` してから `git diff --cached ef8c7a70a7beff150bf5ed5e5ad8c631539a3fd6 > cph-fork.patch` で作り直して、ビルドし直した `cph-fork.vsix` と一緒にコミットします。
