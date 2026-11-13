declare module 'markdown-it-mark' {
    import type MarkdownIt from 'markdown-it';
    const plugin: (md: MarkdownIt) => void;
    export default plugin;
}

declare module 'katex' {
    const katex: { renderToString(tex: string, options?: Record<string, unknown>): string };
    export default katex;
}
