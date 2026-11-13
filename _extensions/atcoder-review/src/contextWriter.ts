/**
 * 今の状態を context.json に書き出す（設計書 4.5・5.1）
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { localIso, toWorkspacePath, writeFileAtomic } from './core';
import { Env, problemFor } from './env';

const DEBOUNCE_MS = 300;

/** 選択範囲を 1 始まりの行で表す。何も選んでいなければ null */
const selectionLines = (sel: vscode.Selection) => {
    if (sel.isEmpty) {
        return null;
    }
    let end = sel.end.line;
    // 行末まで選んで次の行の先頭で止まった時は、その前の行までとみなす
    if (sel.end.character === 0 && end > sel.start.line) {
        end -= 1;
    }
    return { start: sel.start.line + 1, end: end + 1 };
};

export const buildContext = (env: Env, editor: vscode.TextEditor) => {
    const rel = (p: string) => toWorkspacePath(env.workspace, p);
    const srcPath = editor.document.uri.fsPath;
    const info = problemFor(env, srcPath);
    return {
        problem:
            info === null
                ? null
                : {
                      contest: info.task.contest,
                      task: info.task.task,
                      index: info.task.index,
                      url: info.url,
                      probFile: rel(info.probPath),
                  },
        problemDir: info === null ? null : rel(info.problemDir),
        file: rel(srcPath),
        dirty: editor.document.isDirty,
        cursor: { line: editor.selection.active.line + 1 },
        selection: selectionLines(editor.selection),
        env: {
            includePaths: env.includePaths.map(rel),
            atlasPath: env.atlasPath === null ? null : rel(env.atlasPath),
        },
    };
};

export class ContextWriter implements vscode.Disposable {
    private timer: NodeJS.Timeout | undefined;
    private lastEditor: vscode.TextEditor | undefined;
    private lastJson = '';

    constructor(
        private readonly getEnv: () => Env | null,
        private readonly log: (msg: string) => void,
    ) {}

    /** 書き出しを予約する。immediate なら待たずに書く */
    schedule(editor: vscode.TextEditor | undefined, immediate = false) {
        if (editor !== undefined) {
            if (editor.document.uri.scheme !== 'file') {
                return;
            }
            this.lastEditor = editor;
        }
        clearTimeout(this.timer);
        if (immediate) {
            this.write();
        } else {
            this.timer = setTimeout(() => this.write(), DEBOUNCE_MS);
        }
    }

    private write() {
        const env = this.getEnv();
        const editor = this.lastEditor;
        if (env === null || editor === undefined || editor.document.isClosed) {
            return;
        }
        const ctx = buildContext(env, editor);
        const json = JSON.stringify(ctx);
        if (json === this.lastJson) {
            return;
        }
        try {
            writeFileAtomic(
                path.join(env.root, 'context.json'),
                JSON.stringify({ updatedAt: localIso(new Date()), ...ctx }, null, 2) + '\n',
            );
            this.lastJson = json;
        } catch (err) {
            this.log(`context.json を書けませんでした: ${(err as Error).message}`);
        }
    }

    /** 設定が変わった時など、内容が同じでも書き直させる */
    invalidate() {
        this.lastJson = '';
    }

    dispose() {
        clearTimeout(this.timer);
    }
}
