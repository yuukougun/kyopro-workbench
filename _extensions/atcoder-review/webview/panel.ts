/**
 * パネルの webview 側（esbuild で media/panel.js にまとめる）
 *
 * 本文（<id>.md）は Markdown として描く。使えるもの：
 * - 見出し・箇条書き・表・リンク・コードブロック（C++ は色分け）
 * - 数式 `$...$`・`$$...$$`（MathML で描くのでフォントは要らない）
 * - 囲み `> [!NOTE]`・`[!TIP]`・`[!IMPORTANT]`・`[!WARNING]`・`[!CAUTION]`
 * - マーカー `==重要==`、意味の決まった色 `<span class="ok|ng|key">`
 */
import katexPlugin from '@vscode/markdown-it-katex';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import cpp from 'highlight.js/lib/languages/cpp';
import katex from 'katex';
import MarkdownIt from 'markdown-it';
import mark from 'markdown-it-mark';

type Kind = 'bug' | 'risk' | 'hint' | 'improve' | 'alt' | 'library';

type PanelItem = {
    id: string;
    kind: Kind;
    hintLevel?: number;
    title: string;
    links: { title: string; url: string }[];
    line: number | null;
    endLine: number | null;
    origLine: number | null;
    lost: boolean;
    moved: boolean;
    resolved: boolean;
    open: boolean;
    body: string | null;
    hasHtml: boolean;
};

type PanelModel =
    | { kind: 'none' }
    | {
          kind: 'problem';
          task: string;
          progress: string;
          error: string | null;
          warnings: string[];
          sections: { kind: Kind; label: string; items: PanelItem[] }[];
      };

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------- Markdown

hljs.registerLanguage('cpp', cpp);
const CPP_LANGS = new Set(['cpp', 'c++', 'c', 'cc', 'cxx', 'hpp', 'h']);

const md = new MarkdownIt({
    html: true,
    breaks: true,
    highlight: (code, lang) =>
        CPP_LANGS.has(lang.toLowerCase())
            ? `<pre class="hljs"><code>${hljs.highlight(code, { language: 'cpp' }).value}</code></pre>`
            : '',
});
md.use(mark);
md.use(katexPlugin, { katex, output: 'mathml', throwOnError: false });

const ALERTS: Record<string, string> = {
    NOTE: 'メモ',
    TIP: 'ヒント',
    IMPORTANT: '重要',
    WARNING: '注意',
    CAUTION: '危険',
};

// GitHub と同じ囲み（> [!NOTE] など）
md.core.ruler.after('block', 'alerts', (state) => {
    const t = state.tokens;
    for (let i = 0; i + 2 < t.length; i++) {
        if (t[i].type !== 'blockquote_open' || t[i + 1].type !== 'paragraph_open' || t[i + 2].type !== 'inline') {
            continue;
        }
        const m = t[i + 2].content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i);
        if (m === null) {
            continue;
        }
        const type = m[1].toUpperCase();
        t[i + 2].content = t[i + 2].content.slice(m[0].length);
        t[i].attrJoin('class', `alert alert-${type.toLowerCase()}`);
        t[i].attrSet('data-title', ALERTS[type]);
    }
});

const renderMarkdown = (text: string) => DOMPurify.sanitize(md.render(text));

// ---------------------------------------------------------------- 描画

const root = document.getElementById('root')!;
let focusedId: string | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
};

const button = (cls: string, text: string, title: string, onClick: () => void) => {
    const b = el('button', cls, text);
    b.title = title;
    b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return b;
};

const lineLabel = (it: PanelItem) => {
    if (it.lost) return `見失った（元は ${it.origLine} 行）`;
    if (it.line === null) return '行なし';
    const range = it.endLine !== null && it.endLine > it.line ? `${it.line}〜${it.endLine}` : `${it.line}`;
    return `${range} 行${it.moved ? '（移動）' : ''}`;
};

const renderItem = (it: PanelItem) => {
    const li = el('li', `item${it.resolved ? ' resolved' : ''}${it.id === focusedId ? ' focused' : ''}`);
    li.dataset.id = it.id;

    const head = el('div', 'item-head');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = it.resolved;
    box.title = '対処済み';
    box.addEventListener('change', () => vscode.postMessage({ command: 'toggle', id: it.id, resolved: box.checked }));

    const chevron = el('span', `chevron${it.body === null ? ' none' : it.open ? ' open' : ''}`, it.body === null ? '' : '▶');
    const title = el('span', 'title', it.title);
    const toggleOpen = () => {
        if (it.body !== null) {
            vscode.postMessage({ command: 'fold', ids: [it.id], open: !it.open });
        }
    };
    chevron.addEventListener('click', toggleOpen);
    title.addEventListener('click', toggleOpen);
    if (it.body !== null) title.classList.add('clickable');

    head.append(box, chevron, title);

    const meta = el('div', 'item-meta');
    const line = el('span', `line${it.lost ? ' lost' : ''}`, lineLabel(it));
    if (it.line !== null) {
        line.classList.add('clickable');
        line.title = 'この行へ移動';
        line.addEventListener('click', () => vscode.postMessage({ command: 'reveal', id: it.id }));
    }
    meta.append(line);
    if (it.hintLevel) meta.append(el('span', 'level', `Lv${it.hintLevel}`));
    meta.append(el('span', 'id', it.id));
    if (it.hasHtml) {
        meta.append(button('html', 'HTML を開く', '図などを別のタブで開く', () => vscode.postMessage({ command: 'openHtml', id: it.id })));
    }

    li.append(head, meta);
    if (it.links.length > 0) {
        const links = el('div', 'item-links');
        for (const l of it.links) {
            const a = el('a', 'link', l.title);
            a.setAttribute('href', l.url);
            a.title = l.url;
            links.append(a);
        }
        li.append(links);
    }
    if (it.open && it.body !== null) {
        const body = el('div', 'md');
        body.innerHTML = renderMarkdown(it.body);
        li.append(body);
    }
    return li;
};

const render = (m: PanelModel) => {
    root.replaceChildren();
    if (m.kind === 'none') {
        root.append(el('div', 'empty', 'cph で取り込んだ AtCoder の問題のファイルを開くと、ここに指摘が出ます。'));
        return;
    }
    const header = el('div', 'header');
    const info = el('div', 'header-info');
    info.append(el('span', 'task', m.task), el('span', 'progress', m.progress));
    const tools = el('div', 'header-tools');
    tools.append(
        button('tool', 'すべて開く', '本文をすべて開く', () => vscode.postMessage({ command: 'foldAll', open: true })),
        button('tool', 'すべて閉じる', '本文をすべて閉じる', () => vscode.postMessage({ command: 'foldAll', open: false })),
    );
    header.append(info, tools);
    root.append(header);

    if (m.error) root.append(el('div', 'error', `review.json を読めません（直前に読めた内容を表示しています）: ${m.error}`));
    for (const w of m.warnings) root.append(el('div', 'warn', w));

    if (m.sections.length === 0) {
        root.append(el('div', 'empty', '指摘はありません。'));
        return;
    }
    for (const s of m.sections) {
        const h = el('div', `section-head kind-${s.kind}`);
        h.append(el('span', 'dot'), el('span', '', `${s.label}（${s.items.length}）`));
        const ul = el('ul');
        ul.append(...s.items.map(renderItem));
        root.append(h, ul);
    }
};

const applyFocus = (id: string | null) => {
    focusedId = id;
    for (const li of root.querySelectorAll<HTMLElement>('li.item')) {
        const on = li.dataset.id === id;
        li.classList.toggle('focused', on);
        if (on) li.scrollIntoView({ block: 'nearest' });
    }
};

// 本文の中のリンクは、外部のブラウザで開く
root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a');
    if (a !== null) {
        e.preventDefault();
        vscode.postMessage({ command: 'openLink', href: a.getAttribute('href') ?? '' });
    }
});

window.addEventListener('message', (e) => {
    const data = e.data;
    if (data?.command === 'model') render(data.model as PanelModel);
    if (data?.command === 'focus') applyFocus(data.id as string | null);
});

vscode.postMessage({ command: 'ready' });
