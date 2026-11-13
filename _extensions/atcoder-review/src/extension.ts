/**
 * AtCoder Review：AtCoder の精進で、Claude Code との連絡用のファイルを読み書きする拡張
 *
 * - context.json：今開いているファイル・選択範囲・問題を書き出す（Claude が読む）
 * - last_test.json：cph fork のテスト結果を書き出す（Claude が読む）
 * - review.json：Claude が書いた指摘を、エディタとパネルに表示する
 * - review_state.json：パネルで「対処済み」にした指摘を記録する
 *
 * この拡張は Claude を呼ばない。設計は docs/dev/review-tool/design.md。
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ContextWriter } from './contextWriter';
import { readEnv, problemFor } from './env';
import { subscribeTestResults } from './lastTest';
import { ReviewPanel } from './panel';
import { ReviewController } from './review';

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('AtCoder Review');
    const log = (msg: string) => output.appendLine(`${new Date().toLocaleTimeString()} ${msg}`);
    context.subscriptions.push(output);

    let env = readEnv();
    const getEnv = () => env;

    const contextWriter = new ContextWriter(getEnv, log);
    const review = new ReviewController(getEnv, context.extensionUri, log);
    const panel = new ReviewPanel(
        () => review.panelModel(),
        (id, resolved) => review.setResolved(id, resolved),
        (line) => void review.reveal(line),
    );
    context.subscriptions.push(
        contextWriter,
        review,
        vscode.window.registerWebviewViewProvider(ReviewPanel.viewType, panel),
        review.onDidChange((m) => panel.update(m)),
    );

    /** 開いているエディタの問題をレビュー表示に伝える */
    const syncProblem = (editor: vscode.TextEditor | undefined) => {
        if (env === null || editor === undefined || editor.document.uri.scheme !== 'file') {
            return;
        }
        review.setProblem(problemFor(env, editor.document.uri.fsPath));
        review.render();
    };

    // review.json・review_state.json の変更を見張る
    let watcher: vscode.FileSystemWatcher | undefined;
    const watch = () => {
        watcher?.dispose();
        watcher = undefined;
        if (env === null) {
            return;
        }
        try {
            fs.mkdirSync(env.root, { recursive: true });
        } catch (err) {
            log(`${env.root} を作れませんでした: ${(err as Error).message}`);
        }
        watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(env.root), '**/*.json'),
        );
        const onChange = (uri: vscode.Uri) => review.onFileChanged(uri);
        watcher.onDidCreate(onChange);
        watcher.onDidChange(onChange);
        watcher.onDidDelete(onChange);
    };
    watch();
    context.subscriptions.push({ dispose: () => watcher?.dispose() });

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            contextWriter.schedule(editor, true);
            syncProblem(editor);
        }),
        vscode.window.onDidChangeTextEditorSelection((e) => {
            contextWriter.schedule(e.textEditor);
        }),
        vscode.workspace.onDidSaveTextDocument((doc) => {
            const editor = vscode.window.activeTextEditor;
            if (editor?.document === doc) {
                contextWriter.schedule(editor, true);
                syncProblem(editor); // 保存で .prob ができた時のため
            }
        }),
        vscode.workspace.onDidChangeTextDocument((e) => {
            const editor = vscode.window.activeTextEditor;
            if (editor?.document === e.document) {
                contextWriter.schedule(editor); // dirty の変化
            }
            review.render(); // 行のずれの表示を更新する
        }),
        vscode.window.onDidChangeVisibleTextEditors(() => review.render()),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('atcoderReview') || e.affectsConfiguration('cph')) {
                env = readEnv();
                watch();
                contextWriter.invalidate();
                contextWriter.schedule(vscode.window.activeTextEditor, true);
                syncProblem(vscode.window.activeTextEditor);
            }
        }),
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            env = readEnv();
            watch();
        }),
        vscode.commands.registerCommand('atcoderReview.refresh', () => {
            env = readEnv();
            watch();
            contextWriter.invalidate();
            contextWriter.schedule(vscode.window.activeTextEditor, true);
            syncProblem(vscode.window.activeTextEditor);
            review.reload();
        }),
    );

    void subscribeTestResults(getEnv, log).then((d) => {
        if (d !== undefined) {
            context.subscriptions.push(d);
            log('cph fork のテスト結果を受け取ります');
        }
    });

    contextWriter.schedule(vscode.window.activeTextEditor, true);
    syncProblem(vscode.window.activeTextEditor);
    log('起動しました');
}

export function deactivate() {}
