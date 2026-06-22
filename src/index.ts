interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Funcheap (SF Bay Area) MCP.
 *
 * Free & cheap things-to-do in the San Francisco Bay Area, sourced from
 * sf.funcheap.com's public WordPress REST API (keyless). Funcheap publishes a
 * post per event/deal, tagged with facets like "free", "live-music", "comedy",
 * "family-friendly" and neighborhoods. Event date/venue/price live in the post
 * body text (Funcheap's editorial format), which we surface as a clean snippet.
 */


const BASE = 'https://sf.funcheap.com/wp-json/wp/v2';
const UA = 'pipeworx-mcp-funcheap/1.0 (+https://pipeworx.io)';
const MAX_PER_PAGE = 50;

const tools: McpToolExport['tools'] = [
  {
    name: 'search_events',
    description:
      'Search SF Bay Area free & cheap events/deals from Funcheap. Filter by keyword, facet tags (e.g. "free", "live-music", "comedy", "art", "family-friendly", "food"), and a published-date window. Returns newest first by default. Use the `tags`/`categories` tools to discover facet slugs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Full-text keyword search, e.g. "outdoor movie" or "jazz".' },
        tags: { type: 'string', description: 'Comma-separated tag slugs to require, e.g. "free,live-music". Discover via the tags tool.' },
        categories: { type: 'string', description: 'Comma-separated category slugs, e.g. "san-francisco,fairs-festivals".' },
        after: { type: 'string', description: 'Only posts published on/after this ISO date, e.g. "2026-06-19" or "2026-06-19T00:00:00".' },
        before: { type: 'string', description: 'Only posts published on/before this ISO date.' },
        per_page: { type: 'number', description: `Results per page (1-${MAX_PER_PAGE}, default 20).` },
        page: { type: 'number', description: 'Page number (default 1).' },
        orderby: { type: 'string', enum: ['date', 'relevance', 'modified'], description: 'Sort order (default "date" = newest first; "relevance" requires query).' },
      },
    },
  },
  {
    name: 'event',
    description: 'Get a single Funcheap event by numeric post id or slug, with full cleaned body text (date/venue/price details live in the text).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Numeric WordPress post id, e.g. 1624543.' },
        slug: { type: 'string', description: 'Post slug from an event URL, e.g. "fantasia-1940-35mm-live-organ-concert-paramount-theatre-oakland".' },
      },
    },
  },
  {
    name: 'tags',
    description: 'List Funcheap event facet tags (slug, name, count). These are the filterable facets like "free", "live-music", "comedy", neighborhoods. Sorted by usage.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search to find matching tags, e.g. "music".' },
        per_page: { type: 'number', description: `How many to return (1-${MAX_PER_PAGE}, default 40).` },
      },
    },
  },
  {
    name: 'categories',
    description: 'List Funcheap categories (slug, name, count) — broader groupings like neighborhoods, "fairs-festivals", "kids-families". Sorted by usage.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional search to find matching categories.' },
        per_page: { type: 'number', description: `How many to return (1-${MAX_PER_PAGE}, default 40).` },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_events':
      return searchEvents(args);
    case 'event':
      return getEvent(args);
    case 'tags':
      return listTerms('tags', args);
    case 'categories':
      return listTerms('categories', args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function searchEvents(args: Record<string, unknown>): Promise<unknown> {
  const qs = new URLSearchParams();
  qs.set('_fields', 'id,date,modified,title,link,slug,excerpt,tags,categories');
  const perPage = clamp(numArg(args.per_page, 20), 1, MAX_PER_PAGE);
  qs.set('per_page', String(perPage));
  qs.set('page', String(Math.max(1, numArg(args.page, 1))));

  if (typeof args.query === 'string' && args.query.trim()) qs.set('search', args.query.trim());
  if (typeof args.after === 'string' && args.after.trim()) qs.set('after', toIso(args.after.trim()));
  if (typeof args.before === 'string' && args.before.trim()) qs.set('before', toIso(args.before.trim()));

  const orderby = typeof args.orderby === 'string' ? args.orderby : 'date';
  if (orderby === 'relevance') qs.set('orderby', 'relevance');
  else if (orderby === 'modified') qs.set('orderby', 'modified');
  else qs.set('orderby', 'date');

  const tagIds = await resolveTermIds('tags', args.tags);
  if (tagIds.length) qs.set('tags', tagIds.join(','));
  const catIds = await resolveTermIds('categories', args.categories);
  if (catIds.length) qs.set('categories', catIds.join(','));

  const res = await fcFetch(`/posts?${qs.toString()}`);
  const total = res.headers.get('x-wp-total');
  const posts = (await res.json()) as WpPost[];
  return {
    region: 'SF Bay Area',
    source: 'sf.funcheap.com',
    total_matching: total ? Number(total) : undefined,
    page: Math.max(1, numArg(args.page, 1)),
    count: posts.length,
    events: posts.map((p) => normalizePost(p)),
  };
}

async function getEvent(args: Record<string, unknown>): Promise<unknown> {
  const fields = '_fields=id,date,modified,title,link,slug,excerpt,content,tags,categories';
  if (typeof args.id === 'number' || (typeof args.id === 'string' && /^\d+$/.test(args.id))) {
    const post = (await fcFetch(`/posts/${args.id}?${fields}`).then((r) => r.json())) as WpPost;
    return normalizePost(post, true);
  }
  if (typeof args.slug === 'string' && args.slug.trim()) {
    const arr = (await fcFetch(`/posts?slug=${encodeURIComponent(args.slug.trim())}&${fields}`).then((r) => r.json())) as WpPost[];
    if (!arr.length) throw new Error(`No Funcheap event found for slug "${args.slug}".`);
    return normalizePost(arr[0], true);
  }
  throw new Error('Pass either `id` (numeric post id) or `slug`.');
}

async function listTerms(kind: 'tags' | 'categories', args: Record<string, unknown>): Promise<unknown> {
  const qs = new URLSearchParams();
  qs.set('_fields', 'id,name,slug,count');
  qs.set('per_page', String(clamp(numArg(args.per_page, 40), 1, MAX_PER_PAGE)));
  qs.set('orderby', 'count');
  qs.set('order', 'desc');
  if (typeof args.query === 'string' && args.query.trim()) qs.set('search', args.query.trim());
  const terms = (await fcFetch(`/${kind}?${qs.toString()}`).then((r) => r.json())) as WpTerm[];
  return {
    region: 'SF Bay Area',
    kind,
    count: terms.length,
    [kind]: terms.map((t) => ({ slug: t.slug, name: decode(t.name), count: t.count })),
  };
}

/** Resolve a comma-separated list of slugs (or numeric ids) to term ids. */
async function resolveTermIds(kind: 'tags' | 'categories', raw: unknown): Promise<number[]> {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  const slugs: string[] = [];
  for (const p of parts) (/^\d+$/.test(p) ? ids.push(Number(p)) : slugs.push(p));
  if (slugs.length) {
    const arr = (await fcFetch(`/${kind}?slug=${encodeURIComponent(slugs.join(','))}&_fields=id,slug`).then((r) => r.json())) as WpTerm[];
    for (const t of arr) ids.push(t.id);
    const found = new Set(arr.map((t) => t.slug));
    const missing = slugs.filter((s) => !found.has(s));
    if (missing.length && !ids.length) throw new Error(`No ${kind} matched: ${missing.join(', ')}. Use the ${kind} tool to list valid slugs.`);
  }
  return ids;
}

async function fcFetch(path: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Funcheap: ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res;
}

interface WpPost {
  id: number;
  date?: string;
  modified?: string;
  link?: string;
  slug?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  content?: { rendered?: string };
  tags?: number[];
  categories?: number[];
}
interface WpTerm { id: number; name: string; slug: string; count: number }

function normalizePost(p: WpPost, full = false): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id,
    title: decode(stripTags(p.title?.rendered ?? '')),
    url: p.link,
    slug: p.slug,
    posted: p.date,
    summary: decode(stripTags(p.excerpt?.rendered ?? '')).trim(),
  };
  if (full) out.details = decode(stripTags(p.content?.rendered ?? '')).replace(/\s+/g, ' ').trim().slice(0, 4000);
  return out;
}

function stripTags(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…');
}

function toIso(s: string): string {
  // Accept "2026-06-19" → "2026-06-19T00:00:00"; pass through full timestamps.
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
}
function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : dflt;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
