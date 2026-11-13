#!/usr/bin/env bash
# Claude 用テンプレート（CLAUDE.md・.claude/settings.json・.claude/skills/coach-*）を作業フォルダに置く。
#
#   _claude/install.sh [--force] <作業フォルダ>
#
# - 中身の違うファイルがすでにある時は、差分を表示してそのファイルを飛ばす。--force の時だけ上書きする。
# - settings.local.json と CLAUDE.local.md には触れない。
set -euo pipefail

usage() {
    echo "使い方: $0 [--force] <作業フォルダ>" >&2
    echo "  テンプレート（CLAUDE.md, .claude/settings.json, .claude/skills/coach-*）を作業フォルダに置く。" >&2
    echo "  --force  中身の違うファイルがあっても上書きする" >&2
}

force=0
dest=""
for arg in "$@"; do
    case "$arg" in
        --force) force=1 ;;
        -h | --help) usage; exit 0 ;;
        -*) echo "不明なオプション: $arg" >&2; usage; exit 2 ;;
        *)
            if [[ -n "$dest" ]]; then
                echo "作業フォルダは1つだけ指定してください" >&2
                usage
                exit 2
            fi
            dest="$arg"
            ;;
    esac
done

if [[ -z "$dest" ]]; then
    usage
    exit 2
fi
if [[ ! -d "$dest" ]]; then
    echo "作業フォルダが見つかりません: $dest" >&2
    exit 1
fi

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dest="$(cd "$dest" && pwd)"

if [[ "$dest" == "$src" || "$dest" == "$(dirname "$src")" ]]; then
    echo "このリポジトリ自体には置けません。精進に使う作業フォルダを指定してください" >&2
    exit 1
fi

placed=0
skipped=0
same=0

# place <テンプレートからの相対パス> <作業フォルダからの相対パス>
place() {
    local from="$src/$1" to="$dest/$2"
    if [[ -e "$to" ]]; then
        if cmp -s "$from" "$to"; then
            same=$((same + 1))
            return
        fi
        if [[ $force -eq 0 ]]; then
            echo "== 中身が違うので飛ばしました: $2"
            diff -u "$to" "$from" --label "$2（今のファイル）" --label "$2（テンプレート）" || true
            skipped=$((skipped + 1))
            return
        fi
    fi
    mkdir -p "$(dirname "$to")"
    cp "$from" "$to"
    echo "置きました: $2"
    placed=$((placed + 1))
}

place "CLAUDE.md" "CLAUDE.md"
place "settings.json" ".claude/settings.json"
while IFS= read -r -d '' f; do
    rel="${f#"$src"/}"
    place "$rel" ".claude/$rel"
done < <(find "$src/skills" -type f -print0 | sort -z)

echo
echo "置いた: $placed / 同じなので変えなかった: $same / 飛ばした: $skipped"
if [[ $skipped -gt 0 ]]; then
    echo "飛ばしたファイルを上書きするには --force を付けて実行してください。"
    echo "自分用の変更は CLAUDE.local.md や .claude/settings.local.json に書くと、置き直しても消えません。"
fi
