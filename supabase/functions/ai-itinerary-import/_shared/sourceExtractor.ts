const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

export class SourceError extends Error {
  constructor(public readonly code: 'INVALID_SOURCE' | 'SOURCE_TOO_LARGE' | 'SOURCE_CONTENT_UNAVAILABLE', message: string) { super(message); }
}

function privateIpv4(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateIpv6(ip: string) {
  const value = ip.toLowerCase();
  return value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff');
}

async function validateHost(hostname: string) {
  if (privateIpv4(hostname) || privateIpv6(hostname)) throw new SourceError('INVALID_SOURCE', 'This link points to a private network address.');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) return;
  try {
    const [ipv4, ipv6] = await Promise.allSettled([Deno.resolveDns(hostname, 'A'), Deno.resolveDns(hostname, 'AAAA')]);
    const addresses = [...(ipv4.status === 'fulfilled' ? ipv4.value : []), ...(ipv6.status === 'fulfilled' ? ipv6.value : [])];
    if (!addresses.length || addresses.some((address) => privateIpv4(address) || privateIpv6(address))) throw new SourceError('INVALID_SOURCE', 'This link cannot be fetched safely.');
  } catch (error) {
    if (error instanceof SourceError) throw error;
    throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not resolve this page. Paste the post text instead.');
  }
}

async function validateUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new SourceError('INVALID_SOURCE', 'Enter a valid http or https link.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new SourceError('INVALID_SOURCE', 'Enter a public http or https link without credentials.');
  await validateHost(url.hostname);
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
  return value.replace(/&(nbsp|amp|lt|gt|quot|#39);/gi, (_match, entity) => ({ nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[entity.toLowerCase()] ?? ' '));
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

export async function extractPublicUrl(value: string) {
  if (value.length > 2048) throw new SourceError('INVALID_SOURCE', 'This link is too long.');
  let url = await validateUrl(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12_000), headers: { Accept: 'text/html,text/plain;q=0.9' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This link redirects too many times. Paste the post text instead.');
      url = await validateUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not read this page. Paste the post text instead.');
    const type = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This link is not a readable web page. Paste the post text instead.');
    if (/(noai|noindex|none)/i.test(response.headers.get('x-robots-tag') ?? '')) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'This page does not allow automated reading. Paste the post text instead.');
    const raw = await readLimited(response);
    const extracted = type.includes('text/html') ? extractHtml(raw) : { title: '', content: raw.trim().slice(0, 30_000) };
    if (extracted.content.length < 30) throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not find useful travel content. Paste the post text instead.');
    return { ...extracted, url: url.toString() };
  }
  throw new SourceError('SOURCE_CONTENT_UNAVAILABLE', 'We could not read this page. Paste the post text instead.');
}


