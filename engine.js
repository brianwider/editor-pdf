// El mismo codigo Python de la app de Mac, corriendo con Pyodide dentro de este navegador.
importScripts('https://cdn.jsdelivr.net/pyodide/v0.29.0/full/pyodide.js');

let pyodide;
let handle;
let started;
const SAVED = /^\/api\/(signatures\/(upload|delete)|fonts\/upload)/;
const persist = () => new Promise((resolve) => pyodide.FS.syncfs(false, resolve));

async function start() {
  pyodide = await loadPyodide();
  await pyodide.loadPackage('pymupdf');
  for (const file of ['editor.py', 'api.py']) {
    pyodide.FS.writeFile(`/home/pyodide/${file}`, await (await fetch(`py/${file}`)).text());
  }
  // Firmas y fuentes quedan guardadas en este navegador, no en un servidor.
  pyodide.FS.mkdirTree('/data');
  pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, {}, '/data');
  await new Promise((resolve) => pyodide.FS.syncfs(true, resolve));
  await pyodide.runPythonAsync(`
import os, json
os.environ['PDF_EDITOR_DATA'] = '/data'
import api
api.CAPABILITIES['googleFonts'] = False

def bridge(method, url, headers, body):
  status, content, content_type, extra = api.handle(method, url, json.loads(headers), bytes(body))
  return status, content, content_type, json.dumps(extra)
`);
  handle = pyodide.globals.get('bridge');
  postMessage({ type: 'ready' });
}

self.addEventListener('message', async ({ data: { id, request } }) => {
  let response;
  try {
    await started;
    const result = handle(request.method, request.url, JSON.stringify(request.headers), new Uint8Array(request.body));
    const [status, content, contentType, extra] = result.toJs();
    result.destroy();
    const body = content.slice().buffer;
    response = { status, contentType, extra: JSON.parse(extra), body };
    if (status === 200 && SAVED.test(request.url)) await persist();
  } catch (error) {
    console.error(error);
    const body = new TextEncoder().encode(JSON.stringify({ error: 'No se pudo aplicar ese cambio. Recargá la página si sigue fallando.' })).buffer;
    response = { status: 500, contentType: 'application/json', extra: {}, body };
  }
  postMessage({ id, response }, [response.body]);
});

started = start();
started.catch((error) => postMessage({ type: 'failed', error: String(error) }));
