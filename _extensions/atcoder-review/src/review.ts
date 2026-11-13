/**
 * 今の問題の review.json・review_state.json・本文（<id>.md）を読み、エディタとパネルに表示する
 * （設計書 4.8・5.2）
 *
 * エディタ上に出すのはガターのアイコンだけ。指摘の文はパネルに出す。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    Kind,
    KIND_LABELS,
    KINDS,
    localIso,
    Located,
    locateItem,
    parseReview,
    parseState,
    progressLabel,
    pruneState,
    ResolvedState,
    Review,
    ReviewItem,
    writeFileAtomic,
} from './core';
import { Env, ProblemInfo } from './env';

export type PanelItem = {
    id: string;
    kind: Kind;
    hintLevel?: number;
    title: string;
    /** 今表示している行（追従後）。行に結び付かない・見失った時は null */
    line: number | null;
    endLine: number | null;
    /** review.json に書かれた元の行 */
    origLine: number | null;
    lost: boolean;
    moved: boolean;
    resolved: boolean;
    open: boolean;
    /** 本文（<id>.md）。なければ null */
    body: string | null;
    hasHtml: boolean;
};

export type PanelModel =
    | { kind: 'none' }
    | {
          kind: 'problem';
          task: string;
          progress: string;
          error: string | null;
          warnings: string[];
          sections: { kind: Kind; label: string; items: PanelItem[] }[];
      };

const KIND_COLORS: Record<Kind, string> = {
    bug: 'editorError.foreground',
    risk: 'editorWarning.foreground',
    hint: 'editorInfo.foreground',
    improve: 'descriptionForeground',
    alt: 'charts.purple',
    library: 'charts.green',
};

const HIGHLIGHT_MS = 1500;

export class ReviewController implements vscode.Disposable {
    private problem: ProblemInfo | null = null;
    /** 最後に読めた内容。壊れた review.json を読んだ時も、これを表示し続ける */
    private review: Review | null = null;
    private error: string | null = null;
    private state: ResolvedState = {};
    private bodies = new Map<string, string>();
    private htmls = new Set<string>();
    private readonly gutterTypes: Map<Kind, vscode.TextEditorDecorationType>;
    private readonly highlightType: vscode.TextEditorDecorationType;
    private highlightTimer: NodeJS.Timeout | undefined;
    private readonly onChangeEmitter = new vscode.EventEmitter<PanelModel>();
    readonly onDidChange = this.onChangeEmitter.event;
    private readonly onFocusEmitter = new vscode.EventEmitter<string | null>();
    /** カーソルのある行の指摘（パネルで強調する） */
    readonly onDidFocus = this.onFocusEmitter.event;
    private focused: string | null = null;

    constructor(
        private readonly env: () => Env | null,
        extensionUri: vscode.Uri,
        private readonly memento: vscode.Memento,
        private readonly log: (msg: string) => void,
    ) {
        this.gutterTypes = new Map(
            KINDS.map((k) => [
                k,
                vscode.window.createTextEditorDecorationType({
                    gutterIconPath: vscode.Uri.joinPath(extensionUri, 'media', `${k}.svg`),
                    gutterIconSize: 'contain',
                    overviewRulerColor: new vscode.ThemeColor(KIND_COLORS[k]),
                    overviewRulerLane: vscode.OverviewRulerLane.Right,
                }),
            ]),
        );
        this.highlightType = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editor.rangeHighlightBackground'),
        });
    }

    get problemDir() {
        return this.problem?.problemDir ?? null;
    }

    get task() {
        return this.problem?.task.task ?? null;
    }

    private file(name: string) {
        return this.problem && path.join(this.problem.problemDir, name);
    }

    /** 指摘の対象のファイル（絶対パス） */
    private targetFile(): string | null {
        const env = this.env();
        if (this.problem === null || env === null) {
            return null;
        }
        const file = this.review?.file;
        return file ? path.resolve(env.workspace, file) : this.problem.srcPath;
    }

    private findDocument(): vscode.TextDocument | undefined {
        const file = this.targetFile();
        return vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
    }

    /** 開いている問題が変わった時に呼ぶ。問題のファイルでなければ何もしない */
    setProblem(info: ProblemInfo | null) {
        if (info === null) {
            return; // ライブラリなどを開いた時は、直前の問題を表示し続ける
        }
        if (this.problem?.problemDir === info.problemDir && this.problem.srcPath === info.srcPath) {
            return;
        }
        this.problem = info;
        this.review = null;
        this.focused = null;
        this.reload();
    }

    /** 今の問題のフォルダの中のファイルか */
    isOwnFile(uri: vscode.Uri) {
        return this.problem !== null && path.dirname(uri.fsPath) === this.problem.problemDir;
    }

    reload() {
        const reviewPath = this.file('review.json');
        const statePath = this.file('review_state.json');
        if (reviewPath === null || statePath === null) {
            this.render();
            return;
        }
        let text: string | null = null;
        try {
            text = fs.readFileSync(reviewPath, 'utf8');
        } catch {
            text = null;
        }
        if (text === null) {
            this.review = null;
            this.error = null;
        } else {
            const r = parseReview(text);
            if (r.ok) {
                this.review = r.value;
                this.error = null;
            } else {
                this.error = r.error; // 直前に読めた内容は残す
            }
        }
        try {
            this.state = parseState(fs.readFileSync(statePath, 'utf8'));
        } catch {
            this.state = {};
        }
        // review.json から消えた指摘の記録を取り除く（壊れている間は触らない）
        if (this.error === null) {
            const pruned = pruneState(this.state, (this.review?.items ?? []).map((i) => i.id));
            if (pruned !== null) {
                this.state = pruned;
                this.writeState();
            }
        }
        this.bodies.clear();
        this.htmls.clear();
        for (const it of this.review?.items ?? []) {
            try {
                this.bodies.set(it.id, fs.readFileSync(this.file(`${it.id}.md`)!, 'utf8'));
            } catch {
                // 本文がない項目は見出しだけ
            }
            if (fs.existsSync(this.file(`${it.id}.html`)!)) {
                this.htmls.add(it.id);
            }
        }
        this.render();
    }

    setResolved(id: string, resolved: boolean) {
        if (this.review?.items.some((i) => i.id === id) !== true) {
            return;
        }
        if (resolved) {
            this.state = { ...this.state, [id]: { resolved: true, at: localIso(new Date()) } };
        } else {
            const { [id]: _removed, ...rest } = this.state;
            this.state = rest;
        }
        this.writeState();
        this.render();
    }

    private writeState() {
        const statePath = this.file('review_state.json');
        if (statePath === null) {
            return;
        }
        try {
            writeFileAtomic(statePath, JSON.stringify(this.state, null, 2) + '\n');
        } catch (err) {
            this.log(`review_state.json を書けませんでした: ${(err as Error).message}`);
        }
    }

    // ---- 折りたたみ（初期状態は閉じる。開いた項目を拡張の内部に覚える）

    private openKey() {
        return `open:${this.problem?.problemDir}`;
    }

    private openIds(): string[] {
        return this.memento.get<string[]>(this.openKey(), []);
    }

    setOpen(ids: string[], open: boolean) {
        const set = new Set(this.openIds());
        for (const id of ids) {
            if (open) {
                set.add(id);
            } else {
                set.delete(id);
            }
        }
        void this.memento.update(this.openKey(), [...set]);
        this.render();
    }

    setAllOpen(open: boolean) {
        this.setOpen(open ? (this.review?.items ?? []).map((i) => i.id) : this.openIds(), open);
    }

    // ---- 行

    private locate(it: ReviewItem, doc: vscode.TextDocument | undefined): Located {
        if (doc === undefined) {
            // ファイルを開いていない時は、書かれた行のまま
            return it.line === null
                ? { state: 'free' }
                : { state: 'found', line: it.line, endLine: it.endLine ?? it.line, moved: false };
        }
        return locateItem(it, doc.lineCount, (l) => doc.lineAt(l - 1).text);
    }

    /** パネルから指摘の行へ移動し、しばらく強調する */
    async reveal(id: string) {
        const file = this.targetFile();
        const it = this.review?.items.find((i) => i.id === id);
        if (file === null || it === undefined) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument(file);
        const loc = this.locate(it, doc);
        if (loc.state !== 'found') {
            return;
        }
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        const range = new vscode.Range(loc.line - 1, 0, loc.endLine - 1, 0);
        editor.selection = new vscode.Selection(range.start, range.start);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        editor.setDecorations(this.highlightType, [range]);
        clearTimeout(this.highlightTimer);
        this.highlightTimer = setTimeout(() => editor.setDecorations(this.highlightType, []), HIGHLIGHT_MS);
    }

    /** カーソルが動いた時に呼ぶ。その行の指摘をパネルで強調する */
    onCursor(editor: vscode.TextEditor) {
        if (this.review === null || editor.document.uri.fsPath !== this.targetFile()) {
            return;
        }
        const line = editor.selection.active.line + 1;
        let hit: string | null = null;
        for (const it of this.review.items) {
            const loc = this.locate(it, editor.document);
            if (loc.state === 'found' && loc.line <= line && line <= loc.endLine) {
                hit = it.id;
                if (this.state[it.id]?.resolved !== true) {
                    break; // 未対処のものを優先する
                }
            }
        }
        if (hit !== this.focused) {
            this.focused = hit;
            this.onFocusEmitter.fire(hit);
        }
    }

    get focusedId() {
        return this.focused;
    }

    // ---- 表示

    panelModel(): PanelModel {
        if (this.problem === null) {
            return { kind: 'none' };
        }
        const doc = this.findDocument();
        const open = new Set(this.openIds());
        const items: PanelItem[] = (this.review?.items ?? []).map((it) => {
            const loc = this.locate(it, doc);
            return {
                id: it.id,
                kind: it.kind,
                hintLevel: it.hintLevel,
                title: it.title,
                line: loc.state === 'found' ? loc.line : null,
                endLine: loc.state === 'found' ? loc.endLine : null,
                origLine: it.line,
                lost: loc.state === 'lost',
                moved: loc.state === 'found' && loc.moved,
                resolved: this.state[it.id]?.resolved === true,
                open: open.has(it.id),
                body: this.bodies.get(it.id) ?? null,
                hasHtml: this.htmls.has(it.id),
            };
        });
        const order = (p: PanelItem) => (p.line ?? (p.lost ? p.origLine ?? 0 : 0));
        return {
            kind: 'problem',
            task: this.problem.task.task,
            progress: progressLabel(this.review?.progress ?? { maxHint: 0, accepted: false, gaveUp: false }),
            error: this.error,
            warnings: this.review?.warnings ?? [],
            sections: KINDS.map((k) => ({
                kind: k,
                label: KIND_LABELS[k],
                items: items
                    .filter((p) => p.kind === k)
                    .sort((a, b) => order(a) - order(b)),
            })).filter((s) => s.items.length > 0),
        };
    }

    /** エディタのガターのアイコンとパネルを描き直す */
    render() {
        const file = this.targetFile();
        for (const editor of vscode.window.visibleTextEditors) {
            const byKind = new Map<Kind, vscode.DecorationOptions[]>(KINDS.map((k) => [k, []]));
            if (editor.document.uri.fsPath === file && this.review !== null) {
                for (const it of this.review.items) {
                    if (this.state[it.id]?.resolved === true) {
                        continue;
                    }
                    const loc = this.locate(it, editor.document);
                    if (loc.state !== 'found') {
                        continue; // 見失った指摘は、違う行を指さないようアイコンを出さない
                    }
                    byKind.get(it.kind)!.push({
                        range: new vscode.Range(loc.line - 1, 0, loc.endLine - 1, 0),
                    });
                }
            }
            for (const [k, type] of this.gutterTypes) {
                editor.setDecorations(type, byKind.get(k)!);
            }
        }
        this.onChangeEmitter.fire(this.panelModel());
    }

    dispose() {
        for (const t of this.gutterTypes.values()) {
            t.dispose();
        }
        this.highlightType.dispose();
        clearTimeout(this.highlightTimer);
        this.onChangeEmitter.dispose();
        this.onFocusEmitter.dispose();
    }
}
