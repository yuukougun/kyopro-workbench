/**
 * Claude が書いた HTML（<id>.html）を、エディタのタブに表示する
 *
 * VSCode には HTML を表示する標準の機能がないので、webview に読み込ませる。
 * HTML はそのファイルだけで完結して書かれる前提で、拡張から機能を差し込まない。
 * 外部への通信（CDN のライブラリなど）は禁じない。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class HtmlViews implements vscode.Disposable {
    private readonly panels = new Map<string, vscode.WebviewPanel>();

    constructor(private readonly log: (msg: string) => void) {}

    open(file: string, title: string) {
        const existing = this.panels.get(file);
        if (existing !== undefined) {
            existing.reveal(vscode.ViewColumn.Beside);
            this.refresh(file);
            return;
        }
        const dir = vscode.Uri.file(path.dirname(file));
        const panel = vscode.window.createWebviewPanel(
            'atcoderReview.html',
            title,
            vscode.ViewColumn.Beside,
            { enableScripts: true, localResourceRoots: [dir] },
        );
        panel.onDidDispose(() => this.panels.delete(file));
        this.panels.set(file, panel);
        this.refresh(file);
    }

    /** ファイルが変わった時に呼ぶ。開いていれば読み直す */
    refresh(file: string) {
        const panel = this.panels.get(file);
        if (panel === undefined) {
            return;
        }
        let html: string;
        try {
            html = fs.readFileSync(file, 'utf8');
        } catch (err) {
            this.log(`${file} を読めませんでした: ${(err as Error).message}`);
            html = '<p>ファイルを読めませんでした。</p>';
        }
        // 同じフォルダの画像などを相対パスで読めるようにする
        const base = `<base href="${panel.webview.asWebviewUri(vscode.Uri.file(path.dirname(file)))}/">`;
        panel.webview.html = /<head[^>]*>/i.test(html)
            ? html.replace(/<head[^>]*>/i, (m) => `${m}${base}`)
            : `${base}${html}`;
    }

    dispose() {
        for (const p of this.panels.values()) {
            p.dispose();
        }
    }
}
