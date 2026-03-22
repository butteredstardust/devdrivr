import { expose } from 'comlink';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
function makeErrorHandler(errors) {
    return (level, msg) => {
        const prefix = level === 'warning' ? 'Warning' : level === 'error' ? 'Error' : 'Fatal';
        errors.push(`${prefix}: ${msg}`);
    };
}
const api = {
    validate(xml) {
        const errors = [];
        const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) });
        parser.parseFromString(xml, 'text/xml');
        return { valid: errors.length === 0, errors };
    },
    format(xml, indent = 2) {
        const errors = [];
        const parser = new DOMParser({ errorHandler: makeErrorHandler(errors) });
        const doc = parser.parseFromString(xml, 'text/xml');
        if (errors.length > 0) {
            return { valid: false, errors };
        }
        // Simple indentation-based formatting
        const serializer = new XMLSerializer();
        const raw = serializer.serializeToString(doc);
        const formatted = formatXmlString(raw, indent);
        return { valid: true, errors: [], formatted };
    },
    queryXPath(xml, expression) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');
            const serializer = new XMLSerializer();
            const results = [];
            const nodes = evaluateSimpleXPath(doc, expression);
            for (const node of nodes) {
                results.push(serializer.serializeToString(node));
            }
            return { matches: results, count: results.length };
        }
        catch (e) {
            return { matches: [e.message], count: 0 };
        }
    },
};
function formatXmlString(xml, indent) {
    const pad = ' '.repeat(indent);
    let formatted = '';
    let depth = 0;
    const lines = xml.replace(/(>)(<)/g, '$1\n$2').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (trimmed.startsWith('</'))
            depth--;
        formatted += pad.repeat(Math.max(0, depth)) + trimmed + '\n';
        if (trimmed.startsWith('<') &&
            !trimmed.startsWith('</') &&
            !trimmed.startsWith('<?') &&
            !trimmed.endsWith('/>') &&
            !trimmed.includes('</')) {
            depth++;
        }
    }
    return formatted.trimEnd();
}
// Use `any` types for xmldom nodes since they don't match the DOM lib types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evaluateSimpleXPath(doc, expression) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = [];
    try {
        const parts = expression.replace(/^\/\//, '/').split('/').filter(Boolean);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let nodes = [doc.documentElement];
        for (const part of parts) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const next = [];
            const tagName = part.replace(/\[.*\]/, '');
            for (const node of nodes) {
                if (node.childNodes) {
                    for (let i = 0; i < node.childNodes.length; i++) {
                        const child = node.childNodes.item(i);
                        if (child && child.tagName === tagName) {
                            next.push(child);
                        }
                    }
                }
            }
            nodes = next;
        }
        return nodes;
    }
    catch {
        return results;
    }
}
expose(api);
