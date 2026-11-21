/**
 * Reads and writes the Markdown files of src/content/ (YAML frontmatter + body).
 *
 * The parser supports the YAML subset these files use: scalars (quoted or bare), flow arrays/objects written
 * as JSON, block lists (of scalars or of small maps) and one level of nested maps. The writer always emits
 * JSON-quoted strings (valid YAML, no escaping surprises), block lists for images, and keeps key order.
 */

export type FrontValue = string | number | boolean | null | FrontValue[] | { [key: string]: FrontValue };
export type Front = Record<string, FrontValue>;

function scalar(raw: string): FrontValue {
  const value = raw.trim();
  if (value === '') return '';
  if (value.startsWith('"') || value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value) as FrontValue;
    } catch {
      if (value.startsWith('[') && value.endsWith(']')) {
        return value
          .slice(1, -1)
          .split(',')
          .map((part) => scalar(part))
          .filter((part) => part !== '');
      }
      return value;
    }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) return value.slice(1, -1).replace(/''/g, "'");
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function splitKey(line: string): [string, string] | null {
  const match = /^([A-Za-z0-9_-]+):(?:\s(.*))?$/.exec(line);
  return match ? [match[1] ?? '', match[2] ?? ''] : null;
}

export function parseMarkdown(text: string): { data: Front; body: string } {
  const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
  const normalized = text.replace(/\r\n/g, '\n');
  const source = normalized.startsWith(BYTE_ORDER_MARK) ? normalized.slice(1) : normalized;
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) return { data: {}, body: source.trim() };
  const lines = (match[1] ?? '').split('\n');
  const data: Front = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    i++;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const pair = splitKey(line);
    if (!pair) continue;
    const [key, rest] = pair;
    if (rest.trim() !== '') {
      data[key] = scalar(rest);
      continue;
    }
    // Indented block: a list ("  - …") or a map ("  key: …").
    const block: string[] = [];
    while (i < lines.length && /^\s+\S/.test(lines[i] ?? '')) {
      block.push(lines[i] ?? '');
      i++;
    }
    if (block.length === 0) {
      data[key] = '';
    } else if (block[0]?.trimStart().startsWith('- ') || block[0]?.trim() === '-') {
      const list: FrontValue[] = [];
      let current: { [key: string]: FrontValue } | null = null;
      for (const raw of block) {
        const trimmed = raw.trim();
        if (trimmed.startsWith('-')) {
          const item = trimmed.slice(1).trim();
          const itemPair = splitKey(item);
          if (itemPair) {
            current = { [itemPair[0]]: scalar(itemPair[1]) };
            list.push(current);
          } else {
            current = null;
            list.push(scalar(item));
          }
        } else if (current) {
          const inner = splitKey(trimmed);
          if (inner) current[inner[0]] = scalar(inner[1]);
        }
      }
      data[key] = list;
    } else {
      const map: { [key: string]: FrontValue } = {};
      for (const raw of block) {
        const inner = splitKey(raw.trim());
        if (inner) map[inner[0]] = scalar(inner[1]);
      }
      data[key] = map;
    }
  }
  return { data, body: (match[2] ?? '').replace(/^\n+/, '').replace(/\s+$/, '') };
}

function emit(value: FrontValue): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

const DATE_KEYS = new Set(['date', 'endDate']);

export function serializeMarkdown(data: Front, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0 && key !== 'images')) continue;
    if (DATE_KEYS.has(key) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v))) {
        lines.push(`${key}:`);
        for (const item of value as { [key: string]: FrontValue }[]) {
          Object.entries(item).forEach(([k, v], index) => lines.push(`${index === 0 ? '  - ' : '    '}${k}: ${emit(v)}`));
        }
      } else {
        lines.push(`${key}: [${value.map(emit).join(', ')}]`);
      }
    } else if (value !== null && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) lines.push(`  ${k}: ${emit(v)}`);
    } else {
      lines.push(`${key}: ${emit(value)}`);
    }
  }
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}
