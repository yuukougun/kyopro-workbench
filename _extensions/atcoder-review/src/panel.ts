/**
 * 指摘と進み具合のパネル（設計書 5.2）
 */
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { PanelModel } from './review';

type FromWebview =
    | { command: 'ready' }
    | { command: 'toggle'; id: string; resolved: boolean }
    | { command: 'reveal'; line: number };

export class ReviewPanel implements vscode.WebviewViewProvider {
    static readonly viewType = 'atcoderReview.panel';
    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly getModel: () => PanelModel,
        private readonly onToggle: (id: string, resolved: boolean) => void,
        private readonly onReveal: (line: number) => void,
    ) {}

    resolveWebviewView(view: vscode.WebviewView) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = html(view.webview);
        view.webview.onDidReceiveMessage((msg: FromWebview) => {
            switch (msg.command) {
                case 'ready':
                    this.update(this.getModel());
                    break;
                case 'toggle':
                    this.onToggle(msg.id, msg.resolved);
                    break;
                case 'reveal':
                    this.onReveal(msg.line);
                    break;
            }
        });
        view.onDidChangeVisibility(() => {
            if (view.visible) {
                this.update(this.getModel());
            }
        });
    }

    update(model: PanelModel) {
        void this.view?.webview.postMessage({ command: 'model', model });
    }
}

const html = (webview: vscode.Webview) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body { padding: 0 8px; font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
    .head { margin: 8px 0; }
    .task { font-weight: bold; }
    .progress { color: var(--vscode-descriptionForeground); margin-left: 6px; }
    .error { color: var(--vscode-errorForeground); margin: 6px 0; white-space: pre-wrap; }
    .warn { color: var(--vscode-editorWarning-foreground); margin: 6px 0; font-size: 0.9em; }
    .empty { color: var(--vscode-descriptionForeground); margin: 8px 0; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; gap: 6px; align-items: flex-start; padding: 5px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    li.resolved .body { opacity: 0.45; }
    .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; }
    .dot.error { background: var(--vscode-editorError-foreground); }
    .dot.warning { background: var(--vscode-editorWarning-foreground); }
    .dot.info { background: var(--vscode-editorInfo-foreground); }
    .body { flex: 1; cursor: pointer; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
    .shifted { color: var(--vscode-editorWarning-foreground); }
    .msg { white-space: pre-wrap; word-break: break-word; }
    input { margin-top: 3px; flex: none; }
</style>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const root = document.getElementById('root');
const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
};
const render = (m) => {
    root.replaceChildren();
    if (m.kind === 'none') {
        root.append(el('div', 'empty', 'cph で取り込んだ AtCoder の問題のファイルを開くと、ここに指摘が出ます。'));
        return;
    }
    const head = el('div', 'head');
    head.append(el('span', 'task', m.task), el('span', 'progress', m.progress));
    root.append(head);
    if (m.error) root.append(el('div', 'error', 'review.json を読めません（直前に読めた内容を表示しています）: ' + m.error));
    for (const w of m.warnings) root.append(el('div', 'warn', '読み飛ばした指摘: ' + w));
    if (m.items.length === 0) {
        root.append(el('div', 'empty', '指摘はありません。'));
        return;
    }
    const ul = el('ul');
    for (const it of m.items) {
        const li = el('li', it.resolved ? 'resolved' : '');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = it.resolved;
        box.title = '対処済み';
        box.addEventListener('change', () => vscode.postMessage({ command: 'toggle', id: it.id, resolved: box.checked }));
        const body = el('div', 'body');
        const lines = it.endLine > it.line ? it.line + '〜' + it.endLine + ' 行' : it.line + ' 行';
        const meta = el('div', 'meta', lines + (it.hintLevel ? ' ・ Lv' + it.hintLevel : '') + ' ・ ' + it.id);
        if (it.shifted) meta.append(el('span', 'shifted', ' ・ 行がずれている可能性'));
        body.append(meta, el('div', 'msg', it.message));
        body.addEventListener('click', () => vscode.postMessage({ command: 'reveal', line: it.line }));
        li.append(box, el('span', 'dot ' + it.severity), body);
        ul.append(li);
    }
    root.append(ul);
};
window.addEventListener('message', (e) => {
    if (e.data && e.data.command === 'model') render(e.data.model);
});
vscode.postMessage({ command: 'ready' });
</script>
</body>
</html>`;
};
