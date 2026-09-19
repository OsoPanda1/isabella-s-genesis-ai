export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Isabella C.R.O.W.N. — recuperación</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; font: 15px/1.6 system-ui, sans-serif; color: #f5f7ff; background: radial-gradient(circle at 50% 35%, rgba(124,92,255,.18), transparent 36%), #05060b; }
      .card { width: min(620px, 100%); padding: 40px; text-align: center; border: 1px solid rgba(180,150,255,.22); border-radius: 28px; background: rgba(255,255,255,.035); box-shadow: 0 30px 100px rgba(0,0,0,.4); }
      .mark { width: 58px; height: 58px; margin: 0 auto 22px; border-radius: 18px; background: radial-gradient(circle at 35% 30%, #fff, #b9a5ff 25%, #5b3bb8 55%, #0b0d18 75%); box-shadow: 0 0 45px rgba(125,91,255,.35); }
      .eyebrow { margin: 0; color: #a7a1bc; font: 11px/1.4 ui-monospace, monospace; letter-spacing: .22em; text-transform: uppercase; }
      h1 { margin: 14px 0 10px; font-size: 28px; }
      p { margin: 0 auto 24px; color: #9ca3af; max-width: 470px; }
      .actions { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
      a { display: inline-block; padding: 11px 17px; border-radius: 12px; color: #fff; text-decoration: none; border: 1px solid rgba(148,163,184,.2); background: rgba(255,255,255,.04); }
      .primary { border-color: rgba(180,150,255,.5); background: linear-gradient(135deg,#7c5cff,#4d36a8); }
      small { display: block; margin-top: 24px; color: #687083; font: 10px ui-monospace, monospace; }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="mark" aria-hidden="true"></div>
      <p class="eyebrow">C.R.O.W.N. Recovery · Nodo Cero</p>
      <h1>El núcleo público está recuperándose</h1>
      <p>La capa de presentación encontró un fallo de ejecución. El estado de salud permanece disponible para diagnóstico; no se exponen detalles internos del servidor.</p>
      <div class="actions">
        <a class="primary" href="/">Reintentar Isabella</a>
        <a href="/api/health/live">Health</a>
        <a href="/api/health/ready">Readiness</a>
      </div>
      <small>CROWN-SSR-01 · HTTP 500</small>
    </main>
  </body>
</html>`;
}
