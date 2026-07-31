const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 8;

export class SourceError extends Error {
  readonly code: 'INVALID_SOURCE' | 'SOURCE_TOO_LARGE' | 'SOURCE_CONTENT_UNAVAILABLE';

  constructor(code: 'INVALID_SOURCE' | 'SOURCE_TOO_LARGE' | 'SOURCE_CONTENT_UNAVAILABLE', message: string) {
    super(message);
    this.code = code;
  }
}

function normalizedIp(value: string) {
  const withoutBrackets = value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
  return withoutBrackets.split('%')[0].toLowerCase();
}

function ipv4Bytes(value: string): [number, number, number, number] | null {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts as [number, number, number, number]
    : null;
}

function ipv6Words(value: string): number[] | null {
  const normalized = normalizedIp(value);
  if (!normalized.includes(':') || normalized.split('::').length > 2) return null;
  const [left = '', right = ''] = normalized.split('::');
  const parseSide = (side: string) => side ? side.split(':').map((part) => /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN) : [];
  const leftWords = parseSide(left);
  const rightWords = parseSide(right);
  if ([...leftWords, ...rightWords].some((word) => !Number.isInteger(word))) return null;
  const missing = 8 - leftWords.length - rightWords.length;
  if (normalized.includes('::') ? missing < 1 : missing !== 0) return null;
  return [...leftWords, ...Array(missing).fill(0), ...rightWords];
}

export function isPublicIpAddress(value: string) {
  const normalized = normalizedIp(value);
  const ipv4 = ipv4Bytes(normalized);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  const ipv6 = ipv6Words(normalized);
  if (!ipv6) return false;
  // Only globally routable unicast IPv6 is accepted. This rejects loopback,
  // link-local, unique-local, multicast, NAT64, and IPv4-mapped forms.
  return (ipv6[0] & 0xe000) === 0x2000;
}

export function isAllowedUrlHost(hostname: string, allowedHosts: readonly string[]) {
  const host = normalizedIp(hostname).replace(/\.$/, '');
  return allowedHosts.some((entry) => {
    const allowed = normalizedIp(entry.trim()).replace(/^\*\./, '').replace(/\.$/, '');
    return Boolean(allowed) && (host === allowed || host.endsWith(`.${allowed}`));
  });
}

async function validateHost(hostname: string, allowedHosts: readonly string[]) {
  if (!isAllowedUrlHost(hostname, allowedHosts)) throw new SourceError('INVALID_SOURCE', 'This link domain is not approved for AI import. Paste the page text instead.');
  const normalized = normalizedIp(hostname);
  const literalIp = ipv4Bytes(normalized) || normalized.includes(':');
  if (literalIp) {
    if (!isPublicIpAddress(normalized)) throw new SourceError('INVALID_SOURCE', 'This link points to a non-public network address.');
    return;
  }
  try {
    const [ipv4, ipv6] = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')]);
    const addresses = [...(ipv4.status === 'fulfilled' ? ipv4.value : []), ...(ipv6.status === 'fulfilled' ? ipv6.value : [])];
    if (!addresses.length || addresses.some((address) => !isPublicIpAddress(address))) throw new SourceError('INVALID_SOURCE', 'This link cannot be fetched safely.');
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not resolve this page. Paste the post text instead.');
  }
}

export async function validatePublicUrl(value: string, allowedHosts: readonly string[]) {
  let url: URL;
  try { url = new URL(value); } catch { throw new SourceError('INVALID_SOURCE', 'Enter a valid http or https link.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new SourceError('INVALID_SOURCE', 'Enter a public http or https link without credentials.');
  await validateHost(url.hostname, allowedHosts);
  return url;
}

async function readLimited(response: Response) {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BYTES) throw new SourceError('SOURCE_TOO_LARGE', 'This page is larger than the 1 MB import limit.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new SourceError('SOURCE_TOO_LARGE', 'This page is larger than the 1 MB import limit.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function decodeEntities(value: string) {
  const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (_match, entity: string) => entities[entity.toLowerCase()] ?? ' ');
}

function extractHtml(html: string) {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 300);
  const content = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|form|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|article|section|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 30_000);
  return { title, content: decodeEntities(content) };
}

function googleMapsContent(url: URL, html: string) {
  const title = decodeEntities(
    (html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|title)["'][^>]+content=["']([^"']+)/i)?.[1]
      ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?? '')
      .replace(/\s+-\s+Google Maps\s*$/i, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  const fromPath = url.pathname.match(/\/maps\/place\/([^/@?]+)/i)?.[1];
  const fromQuery = ['q', 'query', 'destination', 'daddr'].map((key) => url.searchParams.get(key)).find(Boolean);
  const name = (fromQuery ?? fromPath ? decodeURIComponent(fromQuery ?? fromPath ?? '').replace(/\+/g, ' ') : title).trim();
  const coordinates = url.href.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)?.slice(1, 3);
  if (!name || /^google maps$/i.test(name)) return null;
  return {
    title: title || name,
    content: `Google Maps location: ${name}${coordinates ? `\nCoordinates: ${coordinates[0]}, ${coordinates[1]}` : ''}\nThis is one saved place. Return it as a single itinerary candidate with dayLabel "Imported places".`,
  };
}

export async function extractPublicUrl(value: string, allowedHosts: readonly string[]) {
  if (value.length > 2048) throw new SourceError('INVALID_SOURCE', 'This link is too long.');
  let url = await validatePublicUrl(value, allowedHosts);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { Accept: 'text/html,text/plain;q=0.9', 'Accept-Language': 'en-US,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; TripPlannerImport/1.0)' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This link redirects too many times. Paste the post text instead.');
      url = await validatePublicUrl(new URL(location, url).toString(), allowedHosts);
      continue;
    }
    if (!response.ok) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not read this page. Paste the post text instead.');
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This link is not a readable web page. Paste the post text instead.');
    if (/(noai|noindex|none)/i.test(response.headers.get('x-robots-tag') ?? '')) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This page does not allow automated reading. Paste the post text instead.');
    const raw = await readLimited(response);
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.includes('/maps')) {
      const mapSource = googleMapsContent(url, raw);
      if (mapSource) return { ...mapSource, url: url.toString() };
    }
    const extracted = type.includes('text/html') ? extractHtml(raw) : { title: '', content: raw.trim().slice(0, 30_000) };
    if (extracted.content.length < 30) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not find useful travel content. Paste the post text instead.');
    return { ...extracted, url: url.toString() };
  }
  throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not read this page. Paste the post text instead.');
}
