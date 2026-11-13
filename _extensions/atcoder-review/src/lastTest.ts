/**
 * cph fork のテスト結果を受け取り、last_test.json に書き出す（設計書 4.7・5.3）
 */
import * as path from 'path';
import * as vscode from 'vscode';
import { buildLastTest, CphTestEvent, writeFileAtomic } from './core';
import { Env, problemFor } from './env';

export const CPH_FORK_ID = 'yuukougun.cph-fork';

type CphForkApi = {
    onDidRunTests?: vscode.Event<CphTestEvent>;
};

/** cph fork が入っていれば購読する。入っていなければ何もしない */
export const subscribeTestResults = async (
    getEnv: () => Env | null,
    log: (msg: string) => void,
): Promise<vscode.Disposable | undefined> => {
    const ext = vscode.extensions.getExtension<CphForkApi>(CPH_FORK_ID);
    if (ext === undefined) {
        log(`${CPH_FORK_ID} が入っていないので、テスト結果は書き出しません`);
        return undefined;
    }
    let api: CphForkApi | undefined;
    try {
        api = await ext.activate();
    } catch (err) {
        log(`${CPH_FORK_ID} を起動できませんでした: ${(err as Error).message}`);
        return undefined;
    }
    if (api?.onDidRunTests === undefined) {
        log(`${CPH_FORK_ID} がテスト結果のイベントを公開していません（古い版の可能性）`);
        return undefined;
    }
    return api.onDidRunTests((ev) => {
        const env = getEnv();
        if (env === null) {
            return;
        }
        const info = problemFor(env, ev.srcPath);
        if (info === null) {
            return; // AtCoder の問題でなければ書かない
        }
        try {
            const data = buildLastTest(ev, env.workspace, new Date());
            writeFileAtomic(
                path.join(info.problemDir, 'last_test.json'),
                JSON.stringify(data, null, 2) + '\n',
            );
        } catch (err) {
            log(`last_test.json を書けませんでした: ${(err as Error).message}`);
        }
    });
};
