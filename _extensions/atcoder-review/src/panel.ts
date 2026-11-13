/**
 * 指摘と進み具合のパネル（設計書 5.2）
 *
 * 描画は webview 側（webview/panel.ts を media/panel.js にまとめたもの）で行う。
 */
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { PanelModel } from './review';

type FromWebview =
    | { command: 'ready' }
    | { command: 'toggle'; id: string; resolved: boolean }
    | { command: 'reveal'; id: string }
    | { command: 'fold'; ids: string[]; open: boolean }
    | { command: 'foldAll'; open: boolean }
    | { command: 'openHtml'; id: string }
    | { command: 'openLink'; href: string };

export type PanelActions = {
    model: () => PanelModel;
    focusedId: () => string | null;
    toggle: (id: string, resolved: boolean) => void;
    reveal: (id: string) => void;
    fold: (ids: string[], open: boolean) => void;
    foldAll: (open: boolean) => void;
    openHtml: (id: string) => void;
};

export class ReviewPanel implements vscode.WebviewViewProvider {
    static readonly viewType = 'atcoderReview.panel';
    private view: vscode.WebviewView | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly actions: PanelActions,
    ) {}

    resolveWebviewView(view: vscode.WebviewView) {
        this.view = view;
        const media = vscode.Uri.joinPath(this.extensionUri, 'media');
        view.webview.options = { enableScripts: true, localResourceRoots: [media] };
        view.webview.html = html(view.webview, media);
        view.webview.onDidReceiveMessage((msg: FromWebview) => {
            switch (msg.command) {
                case 'ready':
                    this.update(this.actions.model());
                    this.focus(this.actions.focusedId());
                    break;
                case 'toggle':
                    this.actions.toggle(msg.id, msg.resolved);
                    break;
                case 'reveal':
                    this.actions.reveal(msg.id);
                    break;
                case 'fold':
                    this.actions.fold(msg.ids, msg.open);
                    break;
                case 'foldAll':
                    this.actions.foldAll(msg.open);
                    break;
                case 'openHtml':
                    this.actions.openHtml(msg.id);
                    break;
                case 'openLink':
                    if (/^https?:\/\//.test(msg.href)) {
                        void vscode.env.openExternal(vscode.Uri.parse(msg.href));
                    }
                    break;
            }
        });
        view.onDidChangeVisibility(() => {
            if (view.visible) {
                this.update(this.actions.model());
                this.focus(this.actions.focusedId());
            }
        });
    }

    update(model: PanelModel) {
        void this.view?.webview.postMessage({ command: 'model', model });
    }

    focus(id: string | null) {
        void this.view?.webview.postMessage({ command: 'focus', id });
    }
}

const html = (webview: vscode.Webview, media: vscode.Uri) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(media, 'panel.js'));
    return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${css}">
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
};
