// Arranca el motor dentro del navegador y deja que la app le hable como si fuera un servidor.
(async function boot() {
  const note = document.querySelector('.pitch small');
  const button = document.querySelector('#welcome .primary');
  const original = note.textContent;
  button.classList.add('waiting');
  note.textContent = 'Preparando el editor. La primera vez puede tardar un minuto.';

  const worker = new Worker('engine.js');
  const pending = new Map();
  let nextId = 0;
  const ready = new Promise((resolve, reject) => {
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'ready') return resolve();
      if (data.type === 'failed') return reject(new Error(data.error));
      const port = pending.get(data.id);
      pending.delete(data.id);
      port.postMessage(data.response, [data.response.body]);
    });
  });

  navigator.serviceWorker.addEventListener('message', ({ data, ports }) => {
    const id = nextId++;
    pending.set(id, ports[0]);
    worker.postMessage({ id, request: data }, [data.body]);
  });

  const failed = (error) => {
    note.textContent = 'El editor no pudo iniciar. Revisá tu conexión y recargá la página.';
    console.error(error);
  };

  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    const script = document.createElement('script');
    script.src = 'app.js';
    document.body.append(script);
    await ready;
    button.classList.remove('waiting');
    note.textContent = original;
  } catch (error) {
    failed(error);
  }
})();
