/**
 * 今の問題の review.json・review_state.json を読み、エディタとパネルに表示する（設計書 4.8・5.2）
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
    anchorMatches,
    localIso,
    parseReview,
    parseState,
    progressLabel,
    pruneState,
    ResolvedState,
    Review,
    ReviewItem,
    Severity,
    writeFileAtomic,
} from './core';
import { Env, ProblemInfo } from './env';

export type PanelItem = {
    id: string;
    line: number;
    endLine: number;
    severity: Severity;
    hintLevel?: number;
    message: string;
    resolved: boolean;
    shifted: boolean;
};

export type PanelModel =
    | { kind: 'none' }
    | {
          kind: 'problem';
          task: string;
          progress: string;
          error: string | null;
          warnings: string[];
          items: PanelItem[];
      };

const SEVERITIES: Severity[] = ['error', 'warning', 'info'];
const MAX_INLINE = 80;

export class ReviewController implements vscode.Disposable {
    private problem: ProblemInfo | null = null;
    /** 最後に読めた内容。壊れた review.json を読んだ時も、これを表示し続ける */
    private review: Review | null = null;
    private error: string | null = null;
    private state: ResolvedState = {};
    private readonly decorationTypes: Map<Severity, vscode.TextEditorDecorationType>;
    private readonly onChangeEmitter = new vscode.EventEmitter<PanelModel>();
    readonly onDidChange = this.onChangeEmitter.event;

    constructor(
        private readonly env: () => Env | null,
        extensionUri: vscode.Uri,
        private readonly log: (msg: string) => void,
    ) {
        this.decorationTypes = new Map(
            SEVERITIES.map((s) => [
                s,
                vscode.window.createTextEditorDecorationType({
                    gutterIconPath: vscode.Uri.joinPath(extensionUri, 'media', `${s}.svg`),
                    gutterIconSize: 'contain',
                    overviewRulerColor: new vscode.ThemeColor(
                        s === 'error'
                            ? 'editorError.foreground'
                            : s === 'warning'
                              ? 'editorWarning.foreground'
                              : 'editorInfo.foreground',
                    ),
                    overviewRulerLane: vscode.OverviewRulerLane.Right,
                }),
            ]),
        );
    }

    private reviewPath() {
        return this.problem && path.join(this.problem.problemDir, 'review.json');
    }

    private statePath() {
        return this.problem && path.join(this.problem.problemDir, 'review_state.json');
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

    /** 開いている問題が変わった時に呼ぶ。問題のファイルでなければ null */
    setProblem(info: ProblemInfo | null) {
        if (info === null) {
            return; // ライブラリなどを開いた時は、直前の問題を表示し続ける
        }
        if (this.problem?.problemDir === info.problemDir && this.problem.srcPath === info.srcPath) {
            return;
        }
        this.problem = info;
        this.review = null;
        this.reload();
    }

    /** ファイルが変わった時に呼ぶ。今の問題のファイルなら読み直す */
    onFileChanged(uri: vscode.Uri) {
        const p = uri.fsPath;
        if (p === this.reviewPath() || p === this.statePath()) {
            this.reload();
        }
    }

    reload() {
        const reviewPath = this.reviewPath();
        const statePath = this.statePath();
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
        const statePath = this.statePath();
        if (statePath === null) {
            return;
        }
        try {
            writeFileAtomic(statePath, JSON.stringify(this.state, null, 2) + '\n');
        } catch (err) {
            this.log(`review_state.json を書けませんでした: ${(err as Error).message}`);
        }
    }

    /** パネルから指摘の行へ移動する */
    async reveal(line: number) {
        const file = this.targetFile();
        if (file === null) {
            return;
        }
        const doc = await vscode.workspace.openTextDocument(file);
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        const pos = new vscode.Position(Math.min(line - 1, doc.lineCount - 1), 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }

    private isShifted(item: ReviewItem, doc: vscode.TextDocument | undefined) {
        if (doc === undefined || item.line > doc.lineCount) {
            return doc !== undefined;
        }
        return !anchorMatches(item.anchor, doc.lineAt(item.line - 1).text);
    }

    private findDocument(): vscode.TextDocument | undefined {
        const file = this.targetFile();
        return vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
    }

    panelModel(): PanelModel {
        if (this.problem === null) {
            return { kind: 'none' };
        }
        const doc = this.findDocument();
        const items = (this.review?.items ?? []).map((it) => ({
            id: it.id,
            line: it.line,
            endLine: it.endLine,
            severity: it.severity,
            hintLevel: it.hintLevel,
            message: it.message,
            resolved: this.state[it.id]?.resolved === true,
            shifted: this.isShifted(it, doc),
        }));
        return {
            kind: 'problem',
            task: this.problem.task.task,
            progress: progressLabel(this.review?.progress ?? { maxHint: 0, accepted: false, gaveUp: false }),
            error: this.error,
            warnings: this.review?.warnings ?? [],
            items,
        };
    }

    /** エディタの装飾とパネルを描き直す */
    render() {
        const file = this.targetFile();
        for (const editor of vscode.window.visibleTextEditors) {
            const byType = new Map<Severity, vscode.DecorationOptions[]>(SEVERITIES.map((s) => [s, []]));
            if (editor.document.uri.fsPath === file && this.review !== null) {
                const doc = editor.document;
                for (const it of this.review.items) {
                    if (this.state[it.id]?.resolved === true || it.line > doc.lineCount) {
                        continue;
                    }
                    const shifted = this.isShifted(it, doc);
                    const range = new vscode.Range(
                        it.line - 1,
                        0,
                        Math.min(it.endLine, doc.lineCount) - 1,
                        0,
                    );
                    const level = it.hintLevel ? ` Lv${it.hintLevel}` : '';
                    const hover = new vscode.MarkdownString();
                    hover.appendMarkdown(`**AtCoder Review**（${it.severity}${level}）\n\n`);
                    hover.appendText(it.message);
                    if (shifted) {
                        hover.appendMarkdown('\n\n_指摘を書いた時から行の内容が変わっています。行がずれている可能性があります。_');
                    }
                    const inline = it.message.replace(/\s+/g, ' ');
                    byType.get(it.severity)!.push({
                        range,
                        hoverMessage: hover,
                        renderOptions: {
                            after: {
                                contentText: `  ${shifted ? '（ずれ?）' : ''}${inline.length > MAX_INLINE ? inline.slice(0, MAX_INLINE) + '…' : inline}`,
                                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                                fontStyle: 'italic',
                            },
                        },
                    });
                }
            }
            for (const [s, type] of this.decorationTypes) {
                editor.setDecorations(type, byType.get(s)!);
            }
        }
        this.onChangeEmitter.fire(this.panelModel());
    }

    dispose() {
        for (const t of this.decorationTypes.values()) {
            t.dispose();
        }
        this.onChangeEmitter.dispose();
    }
}
