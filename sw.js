// Lleva cada pedido de /api/ al motor que corre en la pagina. Nada sale a internet.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return;
  event.respondWith(relay(event, url));
});

async function relay(event, url) {
  const client = await self.clients.get(event.clientId);
  if (!client) return new Response(JSON.stringify({ error: 'Recargá la página.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const body = await event.request.arrayBuffer();
  const headers = Object.fromEntries(event.request.headers.entries());
  const channel = new MessageChannel();
  const answer = new Promise((resolve) => (channel.port1.onmessage = ({ data }) => resolve(data)));
  client.postMessage({ method: event.request.method, url: url.pathname + url.search, headers, body }, [channel.port2, body]);
  const { status, contentType, extra, body: content } = await answer;
  return new Response(content, { status, headers: { 'Content-Type': contentType, ...extra } });
}
