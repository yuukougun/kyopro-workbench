/**
 * vscode に依存しない処理（単体テストの対象）
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------- パス

export type TaskInfo = { contest: string; task: string; index: string };

/** AtCoder の問題 URL から contest・task・index を取り出す（cph fork と同じ規則） */
export const parseTaskUrl = (url: string): TaskInfo | null => {
    const m = url.match(/\/contests\/([^/?#]+)\/tasks\/([^/?#]+)/);
    if (!m) {
        return null;
    }
    const task = m[2];
    const index = task.includes('_')
        ? task.slice(task.lastIndexOf('_') + 1)
        : task;
    return { contest: m[1], task, index };
};

/** `${name}` と `~` を展開し、相対パスは base 基準の絶対パスにする。未知の変数は残す */
export const expandPath = (
    template: string,
    vars: Record<string, string>,
    base: string,
): string => {
    let s = template
        .trim()
        .replace(/\$\{(\w+)\}/g, (all, key: string) =>
            key in vars ? vars[key] : all,
        );
    if (s === '~') {
        s = os.homedir();
    } else if (s.startsWith('~/')) {
        s = path.join(os.homedir(), s.slice(2));
    }
    return path.resolve(base, s);
};

/** cph が .prob を置く場所（cph の getProbSaveLocation と同じ規則） */
export const probPathFor = (srcPath: string, saveLocation: string): string => {
    const hash = crypto.createHash('md5').update(srcPath).digest('hex');
    const name = `.${path.basename(srcPath)}_${hash}.prob`;
    if (saveLocation !== '' && fs.existsSync(saveLocation)) {
        return path.join(saveLocation, name);
    }
    return path.join(path.dirname(srcPath), '.cph', name);
};

/** ワークスペース内なら相対パス（区切りは /）、外なら絶対パスのまま */
export const toWorkspacePath = (workspace: string, p: string): string => {
    const rel = path.relative(workspace, p);
    if (rel === '') {
        return '.';
    }
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return p;
    }
    return rel.split(path.sep).join('/');
};

/** 時差つきの ISO 形式（例 2026-11-13T21:04:12+09:00） */
export const localIso = (d: Date): string => {
    const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
        `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
    );
};

/** 途中で読まれても壊れた内容にならないよう、一時ファイルに書いてから置き換える */
export const writeFileAtomic = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
};

// ---------------------------------------------------------------- テスト結果

/** cph fork の onDidRunTests が渡すケース */
export type CphTestCase = {
    id: number;
    pass: boolean | null;
    timeMs: number;
    timeOut: boolean;
    code: number | null;
    signal: string | null;
    input: string;
    expected: string;
    stdout: string;
    stderr: string;
};

export type CphTestEvent = {
    srcPath: string;
    url: string;
    compile: { ok: boolean };
    cases: CphTestCase[];
};

export type Verdict = 'AC' | 'WA' | 'TLE' | 'RE' | 'UNKNOWN';

export const verdictOf = (c: CphTestCase): Verdict => {
    if (c.pass === true) {
        return 'AC';
    }
    if (c.timeOut) {
        return 'TLE';
    }
    if (c.signal !== null || (c.code !== null && c.code !== 0)) {
        return 'RE';
    }
    return c.pass === false ? 'WA' : 'UNKNOWN';
};

export const MAX_LINES = 20;
export const MAX_CHARS = 1000;
/** 入出力を書く不正解のケースの数（残りは判定だけ） */
export const MAX_DETAILED_CASES = 2;

/** 長い入出力は先頭だけにする */
export const truncate = (text: string): string => {
    const lines = text.split('\n');
    let out = lines.slice(0, MAX_LINES).join('\n');
    if (out.length > MAX_CHARS) {
        out = out.slice(0, MAX_CHARS);
    }
    if (out.length < text.length) {
        out += `\n…（以下略。全 ${lines.length} 行・${text.length} 文字。全文は .prob にある）`;
    }
    return out;
};

/**
 * last_test.json の中身。Claude が読むので、文脈を圧迫しないよう小さく保つ。
 * - 入出力は、最初の MAX_DETAILED_CASES 件の不正解のケースだけに書く
 * - 標準エラー（デバッグ出力など）は書かない
 */
export const buildLastTest = (ev: CphTestEvent, workspace: string, now: Date) => {
    let detailed = 0;
    return {
        at: localIso(now),
        file: toWorkspacePath(workspace, ev.srcPath),
        compile: { ok: ev.compile.ok },
        cases: ev.cases.map((c) => {
            const verdict = verdictOf(c);
            const base = { id: c.id, verdict, timeMs: c.timeMs };
            if (verdict === 'AC' || detailed >= MAX_DETAILED_CASES) {
                return base;
            }
            detailed++;
            return {
                ...base,
                input: truncate(c.input),
                expected: truncate(c.expected),
                actual: truncate(c.stdout),
            };
        }),
    };
};

// ---------------------------------------------------------------- 指摘

/** 指摘の種類。パネルではこの順に並べる */
export const KINDS = ['bug', 'risk', 'hint', 'improve', 'alt', 'library'] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, string> = {
    bug: '誤り',
    risk: '誤りの可能性',
    hint: 'ヒント',
    improve: '改善',
    alt: '別解',
    library: 'ライブラリ化の候補',
};

export type ReviewItem = {
    id: string;
    /** 1 始まりの行。null なら行に結び付かない項目 */
    line: number | null;
    endLine: number | null;
    anchor?: string;
    kind: Kind;
    hintLevel?: number;
    title: string;
    /** 関連ページ（kyopro-atlas など）。見出しの下に並べる */
    links: Link[];
};

export type Link = { title: string; url: string };

export type Progress = { maxHint: number; accepted: boolean; gaveUp: boolean };

export type Review = {
    file: string | null;
    progress: Progress;
    items: ReviewItem[];
    /** 読み飛ばした・直して読んだ項目の説明（形が正しくなかったもの） */
    warnings: string[];
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

const isLine = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1;

/** 本文（<id>.md）と図（<id>.html）のファイル名に使えるか */
const isSafeId = (id: string) => /^[A-Za-z0-9_-]+$/.test(id);

/** review.json を読む。項目単位の誤りは読み飛ばして warnings に入れる */
export const parseReview = (text: string): ParseResult<Review> => {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch (err) {
        return { ok: false, error: `JSON として読めません: ${(err as Error).message}` };
    }
    if (!isObject(data)) {
        return { ok: false, error: '一番外側がオブジェクトではありません' };
    }
    const p = isObject(data.progress) ? data.progress : {};
    const maxHint =
        typeof p.maxHint === 'number' && Number.isInteger(p.maxHint)
            ? Math.min(Math.max(p.maxHint, 0), 3)
            : 0;
    const progress: Progress = {
        maxHint,
        accepted: p.accepted === true,
        gaveUp: p.gaveUp === true,
    };

    const items: ReviewItem[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    if (data.items !== undefined && !Array.isArray(data.items)) {
        warnings.push('items が配列ではありません');
    }
    const rawItems = Array.isArray(data.items) ? data.items : [];
    rawItems.forEach((it: unknown, i: number) => {
        if (!isObject(it)) {
            warnings.push(`items[${i}] がオブジェクトではありません`);
            return;
        }
        if (typeof it.id !== 'string' || !isSafeId(it.id)) {
            warnings.push(`items[${i}] の id がないか、英数字・-・_ 以外を含みます`);
            return;
        }
        if (seen.has(it.id)) {
            warnings.push(`id ${it.id} が重複しています`);
            return;
        }
        if (typeof it.title !== 'string' || it.title.trim() === '') {
            warnings.push(`${it.id}: title がありません`);
            return;
        }
        let line: number | null = null;
        if (it.line !== undefined && it.line !== null) {
            if (!isLine(it.line)) {
                warnings.push(`${it.id}: line が1以上の整数ではありません`);
                return;
            }
            line = it.line;
        }
        let kind: Kind = 'hint';
        if ((KINDS as readonly unknown[]).includes(it.kind)) {
            kind = it.kind as Kind;
        } else {
            warnings.push(`${it.id}: kind が ${KINDS.join('・')} のどれでもないので、hint として表示しています`);
        }
        const links: Link[] = [];
        if (Array.isArray(it.links)) {
            for (const l of it.links) {
                if (isObject(l) && typeof l.title === 'string' && typeof l.url === 'string' && /^https?:\/\//.test(l.url)) {
                    links.push({ title: l.title, url: l.url });
                } else {
                    warnings.push(`${it.id}: links に、title と http(s) の url を持たないものがあります`);
                }
            }
        } else if (it.links !== undefined) {
            warnings.push(`${it.id}: links が配列ではありません`);
        }
        seen.add(it.id);
        items.push({
            id: it.id,
            line,
            endLine: line === null ? null : isLine(it.endLine) && it.endLine >= line ? it.endLine : line,
            anchor: typeof it.anchor === 'string' ? it.anchor : undefined,
            kind,
            hintLevel: typeof it.hintLevel === 'number' ? it.hintLevel : undefined,
            title: it.title,
            links,
        });
    });
    return {
        ok: true,
        value: {
            file: typeof data.file === 'string' ? data.file : null,
            progress,
            items,
            warnings,
        },
    };
};

/** 短すぎる・記号だけの行は、ほかの行と取り違えやすいので追従に使わない */
export const isDistinctiveAnchor = (anchor: string) => {
    const t = anchor.trim();
    return t.length >= 3 && !/^[\s{}()[\];,]*$/.test(t);
};

export type Located =
    | { state: 'free' } // 行に結び付かない項目
    | { state: 'found'; line: number; endLine: number; moved: boolean }
    | { state: 'lost' };

/**
 * 指摘を書いた時の行の内容（anchor）を手がかりに、今どの行にあるかを探す。
 * 元の行から近い順に上下を探し、同じ距離なら下を優先する（上に行を足すと下へずれることが多いため）。
 */
export const locateItem = (
    item: Pick<ReviewItem, 'line' | 'endLine' | 'anchor'>,
    lineCount: number,
    lineAt: (line: number) => string,
): Located => {
    if (item.line === null) {
        return { state: 'free' };
    }
    const span = (item.endLine ?? item.line) - item.line;
    const at = (line: number, moved: boolean): Located => ({
        state: 'found',
        line,
        endLine: Math.min(line + span, lineCount),
        moved,
    });
    const matches = (line: number) =>
        line >= 1 && line <= lineCount && lineAt(line).trim() === item.anchor!.trim();

    if (item.anchor === undefined) {
        return item.line <= lineCount ? at(item.line, false) : { state: 'lost' };
    }
    if (matches(item.line)) {
        return at(item.line, false);
    }
    if (!isDistinctiveAnchor(item.anchor)) {
        return { state: 'lost' };
    }
    for (let d = 1; d < lineCount + item.line; d++) {
        if (matches(item.line + d)) {
            return at(item.line + d, true);
        }
        if (matches(item.line - d)) {
            return at(item.line - d, true);
        }
    }
    return { state: 'lost' };
};

export type ResolvedState = Record<string, { resolved: boolean; at?: string }>;

/** review_state.json を読む。読めなければ空として扱う */
export const parseState = (text: string): ResolvedState => {
    try {
        const data: unknown = JSON.parse(text);
        if (!isObject(data)) {
            return {};
        }
        const out: ResolvedState = {};
        for (const [id, v] of Object.entries(data)) {
            if (isObject(v) && typeof v.resolved === 'boolean') {
                out[id] = {
                    resolved: v.resolved,
                    ...(typeof v.at === 'string' ? { at: v.at } : {}),
                };
            }
        }
        return out;
    } catch {
        return {};
    }
};

/** review.json から消えた指摘の記録を取り除く。変わらなければ null */
export const pruneState = (
    state: ResolvedState,
    ids: Iterable<string>,
): ResolvedState | null => {
    const keep = new Set(ids);
    const out: ResolvedState = {};
    let changed = false;
    for (const [id, v] of Object.entries(state)) {
        if (keep.has(id)) {
            out[id] = v;
        } else {
            changed = true;
        }
    }
    return changed ? out : null;
};

export const progressLabel = (p: Progress): string => {
    const parts = [p.maxHint === 0 ? 'ヒントなし' : `ヒント Lv${p.maxHint}`];
    if (p.accepted) {
        parts.push('AC');
    }
    if (p.gaveUp) {
        parts.push('ギブアップ');
    }
    return parts.join(' / ');
};
