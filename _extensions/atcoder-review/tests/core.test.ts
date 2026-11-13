import * as assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
    anchorMatches,
    buildLastTest,
    CphTestCase,
    expandPath,
    localIso,
    MAX_LINES,
    parseReview,
    parseState,
    parseTaskUrl,
    probPathFor,
    progressLabel,
    pruneState,
    toWorkspacePath,
    truncate,
    verdictOf,
    writeFileAtomic,
} from '../src/core';

test('parseTaskUrl: AtCoder の問題 URL', () => {
    assert.deepEqual(parseTaskUrl('https://atcoder.jp/contests/abc400/tasks/abc400_c'), {
        contest: 'abc400',
        task: 'abc400_c',
        index: 'c',
    });
    assert.deepEqual(parseTaskUrl('https://atcoder.jp/contests/arc001/tasks/arc001_1?lang=ja'), {
        contest: 'arc001',
        task: 'arc001_1',
        index: '1',
    });
    assert.equal(parseTaskUrl('/home/u/a.cpp'), null);
    assert.equal(parseTaskUrl('https://codeforces.com/contest/1/problem/A'), null);
});

test('expandPath: 変数・~・相対パス', () => {
    const ws = '/w';
    assert.equal(expandPath('${workspaceFolder}/.atcoder-review', { workspaceFolder: ws }, ws), '/w/.atcoder-review');
    assert.equal(expandPath('${root}/${contest}/${index}', { root: '/w/.r', contest: 'abc1', index: 'a' }, ws), '/w/.r/abc1/a');
    assert.equal(expandPath('lib/include', {}, ws), '/w/lib/include');
    assert.equal(expandPath('~/x', {}, ws), path.join(os.homedir(), 'x'));
    assert.equal(expandPath('${unknown}/a', {}, ws), '/w/${unknown}/a');
});

test('probPathFor: cph と同じ名前', () => {
    const src = '/w/abc400/c.cpp';
    const hash = crypto.createHash('md5').update(src).digest('hex');
    assert.equal(probPathFor(src, ''), `/w/abc400/.cph/.c.cpp_${hash}.prob`);
    // 存在しない保存先は、cph と同じく既定の場所に戻す
    assert.equal(probPathFor(src, '/no/such/dir'), `/w/abc400/.cph/.c.cpp_${hash}.prob`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-'));
    assert.equal(probPathFor(src, dir), path.join(dir, `.c.cpp_${hash}.prob`));
});

test('toWorkspacePath: 中は相対、外は絶対', () => {
    assert.equal(toWorkspacePath('/w', '/w/abc400/c.cpp'), 'abc400/c.cpp');
    assert.equal(toWorkspacePath('/w', '/w'), '.');
    assert.equal(toWorkspacePath('/w', '/x/y'), '/x/y');
    assert.equal(toWorkspacePath('/w', '/w2/y'), '/w2/y');
});

test('localIso: 時差つき', () => {
    assert.match(localIso(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
});

test('writeFileAtomic: フォルダを作って書く', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-'));
    const f = path.join(dir, 'a', 'b', 'x.json');
    writeFileAtomic(f, '{}\n');
    assert.equal(fs.readFileSync(f, 'utf8'), '{}\n');
    assert.deepEqual(fs.readdirSync(path.dirname(f)), ['x.json']);
});

const tc = (over: Partial<CphTestCase>): CphTestCase => ({
    id: 1,
    pass: true,
    timeMs: 10,
    timeOut: false,
    code: 0,
    signal: null,
    input: '1\n',
    expected: '2\n',
    stdout: '2\n',
    stderr: '',
    ...over,
});

test('verdictOf', () => {
    assert.equal(verdictOf(tc({})), 'AC');
    assert.equal(verdictOf(tc({ pass: false })), 'WA');
    assert.equal(verdictOf(tc({ pass: false, timeOut: true, signal: 'SIGTERM' })), 'TLE');
    assert.equal(verdictOf(tc({ pass: false, code: 139 })), 'RE');
    assert.equal(verdictOf(tc({ pass: false, signal: 'SIGSEGV', code: null })), 'RE');
    assert.equal(verdictOf(tc({ pass: null })), 'UNKNOWN');
});

test('truncate: 長い入出力は先頭だけ', () => {
    assert.equal(truncate('a\nb'), 'a\nb');
    const long = Array.from({ length: 100 }, (_, i) => String(i)).join('\n');
    const t = truncate(long);
    assert.equal(t.split('\n').length, MAX_LINES + 1);
    assert.match(t, /全 100 行/);
});

test('buildLastTest: AC 以外だけ入出力を書く', () => {
    const r = buildLastTest(
        {
            srcPath: '/w/abc400/c.cpp',
            url: 'https://atcoder.jp/contests/abc400/tasks/abc400_c',
            compile: { ok: true },
            cases: [tc({ id: 1 }), tc({ id: 2, pass: false, stdout: '3\n', stderr: 'warn' })],
        },
        '/w',
        new Date(),
    );
    assert.equal(r.file, 'abc400/c.cpp');
    assert.deepEqual(r.cases[0], { id: 1, verdict: 'AC', timeMs: 10 });
    assert.deepEqual(r.cases[1], {
        id: 2,
        verdict: 'WA',
        timeMs: 10,
        input: '1\n',
        expected: '2\n',
        actual: '3\n',
        stderr: 'warn',
    });
});

test('parseReview: 正しい形', () => {
    const r = parseReview(
        JSON.stringify({
            file: 'abc400/c.cpp',
            progress: { maxHint: 2, accepted: true },
            nextId: 3,
            items: [
                { id: 'r1', line: 3, endLine: 5, anchor: 'x', severity: 'error', hintLevel: 1, message: 'm1' },
                { id: 'r2', line: 7, message: 'm2' },
            ],
        }),
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.value.progress, { maxHint: 2, accepted: true, gaveUp: false });
    assert.equal(r.value.items.length, 2);
    assert.equal(r.value.items[1].severity, 'warning');
    assert.equal(r.value.items[1].endLine, 7);
    assert.deepEqual(r.value.warnings, []);
});

test('parseReview: 壊れた JSON と、形の違う項目', () => {
    const bad = parseReview('{"items": [');
    assert.equal(bad.ok, false);
    assert.equal(parseReview('[]').ok, false);
    const r = parseReview(
        JSON.stringify({
            progress: { maxHint: 9 },
            items: [
                { id: 'r1', line: 0, message: 'x' },
                { line: 2, message: 'x' },
                { id: 'r3', line: 2 },
                { id: 'r4', line: 2, message: 'ok' },
                { id: 'r4', line: 3, message: 'dup' },
            ],
        }),
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.value.progress.maxHint, 3);
    assert.deepEqual(r.value.items.map((i) => i.id), ['r4']);
    assert.equal(r.value.warnings.length, 4);
});

test('parseState と pruneState', () => {
    const s = parseState(JSON.stringify({ r1: { resolved: true, at: 't' }, r2: { resolved: false }, bad: 1 }));
    assert.deepEqual(s, { r1: { resolved: true, at: 't' }, r2: { resolved: false } });
    assert.deepEqual(parseState('not json'), {});
    assert.equal(pruneState(s, ['r1', 'r2', 'r3']), null);
    assert.deepEqual(pruneState(s, ['r2']), { r2: { resolved: false } });
});

test('anchorMatches: 前後の空白は無視', () => {
    assert.ok(anchorMatches(undefined, 'x'));
    assert.ok(anchorMatches('for (;;) {', '    for (;;) {  '));
    assert.ok(!anchorMatches('for (;;) {', 'while (1) {'));
    assert.ok(!anchorMatches('x', undefined));
});

test('progressLabel', () => {
    assert.equal(progressLabel({ maxHint: 0, accepted: false, gaveUp: false }), 'ヒントなし');
    assert.equal(progressLabel({ maxHint: 2, accepted: true, gaveUp: false }), 'ヒント Lv2 / AC');
    assert.equal(progressLabel({ maxHint: 3, accepted: false, gaveUp: true }), 'ヒント Lv3 / ギブアップ');
});
