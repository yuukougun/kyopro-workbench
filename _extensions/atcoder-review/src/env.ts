/**
 * 設定とファイルの場所を決める
 */
import * as fs from 'fs';
import * as vscode from 'vscode';
import { expandPath, parseTaskUrl, probPathFor, TaskInfo } from './core';

export type Env = {
    workspace: string;
    /** context.json を置くフォルダ（絶対パス） */
    root: string;
    problemDirTemplate: string;
    /** kyopro-atlas の場所（絶対パス）。連携しないなら null */
    atlasPath: string | null;
    /** cph fork の cph.bundle.includePaths を展開したもの（絶対パス） */
    includePaths: string[];
};

export const readEnv = (): Env | null => {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspace === undefined) {
        return null;
    }
    const vars = { workspaceFolder: workspace };
    const c = vscode.workspace.getConfiguration('atcoderReview');
    const root = expandPath(
        c.get<string>('root', '${workspaceFolder}/.atcoder-review'),
        vars,
        workspace,
    );
    const atlas = c.get<string>('atlasPath', '').trim();
    const includePaths = vscode.workspace
        .getConfiguration('cph')
        .get<string[]>('bundle.includePaths', [])
        .filter((p) => typeof p === 'string' && p.trim() !== '')
        .map((p) => expandPath(p, vars, workspace));
    return {
        workspace,
        root,
        problemDirTemplate: c.get<string>(
            'problemDirectory',
            '${root}/${contest}/${index}',
        ),
        atlasPath: atlas === '' ? null : expandPath(atlas, vars, workspace),
        includePaths,
    };
};

export type ProblemInfo = {
    srcPath: string;
    probPath: string;
    url: string;
    task: TaskInfo;
    /** 問題ごとのファイル（review.json など）を置くフォルダ（絶対パス） */
    problemDir: string;
};

/** ソースファイルに対応する AtCoder の問題。.prob がないか AtCoder の問題でなければ null */
export const problemFor = (env: Env, srcPath: string): ProblemInfo | null => {
    const saveLocation = vscode.workspace
        .getConfiguration('cph')
        .get<string>('general.saveLocation', '');
    const probPath = probPathFor(srcPath, saveLocation);
    let url = '';
    try {
        const prob: unknown = JSON.parse(fs.readFileSync(probPath, 'utf8'));
        if (typeof prob === 'object' && prob !== null && 'url' in prob) {
            url = String((prob as { url: unknown }).url);
        }
    } catch {
        return null;
    }
    const task = parseTaskUrl(url);
    if (task === null) {
        return null;
    }
    const problemDir = expandPath(
        env.problemDirTemplate,
        { workspaceFolder: env.workspace, root: env.root, ...task },
        env.workspace,
    );
    return { srcPath, probPath, url, task, problemDir };
};
