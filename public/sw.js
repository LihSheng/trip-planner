const CACHE_VERSION = 2;
const CACHE_NAME = `trip-planner-shell-v${CACHE_VERSION}`;
const SCOPE_URL = self.registration.scope;
const STATIC_SHELL = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

// The worker registers after window load, so on a first visit the bundles never pass through it.
function shellAssetUrls(html) {
  const tags = html.match(/<script\b[^>]*>|<link\b[^>]*>/gi) ?? [];
  const urls = tags.flatMap((tag) => {
    const isScript = /^<script/i.test(tag);
    if (!isScript && !/\brel\s*=\s*["']?stylesheet\b/i.test(tag)) return [];
    const match = tag.match(isScript ? /\bsrc\s*=\s*["']([^"']+)["']/i : /\bhref\s*=\s*["']([^"']+)["']/i);
    return match ? [new URL(match[1], SCOPE_URL)] : [];
  });
  return urls.filter((url) => url.origin === self.location.origin).map((url) => url.href);
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch(SCOPE_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Shell request failed (${response.status})`);
  const html = await response.clone().text();
  const staticUrls = STATIC_SHELL.map((path) => new URL(path, SCOPE_URL).href);
  await cache.addAll([...new Set([...shellAssetUrls(html), ...staticUrls])]);
  await cache.put(SCOPE_URL, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(SCOPE_URL, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(SCOPE_URL);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  // Module scripts send Origin and precached responses may carry Vary: Origin.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !request.url.startsWith(SCOPE_URL)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
