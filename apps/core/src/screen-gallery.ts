export const screenGalleryHtml = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ShipOS · Stream Memory</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
    body { color: #d7ddd0; }
    main { position: relative; width: 100vw; height: 100vh; min-height: 180px; }
    .empty { display: grid; place-items: center; width: 100%; height: 100%; color: #91a1a3; letter-spacing: .18em; text-transform: uppercase; font: 12px monospace; }
    .stage { position: absolute; inset: 0; display: grid; place-items: center; }
    .stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 500ms ease; }
    .stage img.visible { opacity: 1; }
    .caption { position: absolute; left: 4vw; right: 4vw; bottom: 4vh; display: flex; justify-content: space-between; gap: 2rem; padding: .7rem 1rem; color: #bacdaa; background: rgba(8, 17, 18, .78); border-left: 3px solid #bacdaa; font: 12px/1.4 monospace; letter-spacing: .12em; text-transform: uppercase; }
    .mosaic { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 1.5vw; width: 92%; height: 86%; }
    .mosaic img { width: 100%; height: 100%; min-height: 0; object-fit: contain; border: 1px solid rgba(186, 205, 170, .45); background: rgba(8, 17, 18, .65); }
    .mosaic:has(img:only-child) { grid-template-columns: 1fr; }
    @media (max-width: 900px) { .mosaic { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (prefers-reduced-motion: reduce) { .stage img { transition: none; } }
  </style>
</head>
<body>
  <main id="app"><div class="empty">STREAM MEMORY / NO CAPTURES</div></main>
  <script>
    (() => {
      const params = new URLSearchParams(location.search);
      const mode = params.get('mode') === 'mosaic' ? 'mosaic' : 'slideshow';
      const app = document.getElementById('app');
      let shots = [], index = 0, sessionId = '', timer;
      const format = (at) => new Date(at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const safeUrl = (url) => typeof url === 'string' && /^\\/api\\/v1\\/screens\\/gallery\\/[0-9a-f-]{36}\\/[0-9a-f-]{36}$/.test(url) ? url : '';
      const choose = (payload) => {
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
        const session = sessions.find((item) => item.active && Array.isArray(item.shots) && item.shots.length) || sessions.find((item) => Array.isArray(item.shots) && item.shots.length);
        if (!session) return { id: '', shots: [] };
        return { id: String(session.id), shots: session.shots.filter((shot) => safeUrl(shot.url)) };
      };
      const renderEmpty = () => { app.innerHTML = '<div class="empty">STREAM MEMORY / NO CAPTURES</div>'; };
      const renderMosaic = () => {
        app.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'mosaic';
        shots.slice().reverse().forEach((shot) => {
          const image = document.createElement('img');
          image.src = shot.url;
          image.alt = 'Capture du stream';
          image.loading = 'lazy';
          grid.append(image);
        });
        app.append(grid);
      };
      const renderSlide = () => {
        app.innerHTML = '<div class="stage"><img class="slide-a"><img class="slide-b"></div><div class="caption"><span>SHIPOS / STREAM MEMORY</span><span class="count"></span></div>';
        const images = [...app.querySelectorAll('.stage img')];
        const count = app.querySelector('.count');
        const show = () => {
          if (!shots.length) return;
          const shot = shots[index % shots.length];
          const current = images[index % 2];
          current.src = shot.url;
          current.alt = 'Capture du stream';
          requestAnimationFrame(() => {
            images.forEach((image) => image.classList.remove('visible'));
            current.classList.add('visible');
          });
          count.textContent = 'CAPTURE ' + String((index % shots.length) + 1).padStart(2, '0') + ' / ' + String(shots.length).padStart(2, '0') + ' · ' + format(shot.at);
          index = (index + 1) % shots.length;
        };
        show();
        clearInterval(timer);
        timer = setInterval(show, 9000);
      };
      const render = (payload) => {
        const chosen = choose(payload);
        if (chosen.id !== sessionId) { sessionId = chosen.id; index = 0; }
        shots = chosen.shots;
        if (!shots.length) return renderEmpty();
        if (mode === 'mosaic') { clearInterval(timer); renderMosaic(); } else renderSlide();
      };
      const refresh = async () => {
        try {
          const response = await fetch('/api/v1/screens/gallery', { cache: 'no-store' });
          if (response.ok) render(await response.json());
        } catch (_) { /* the Browser Source can retry on the next refresh */ }
      };
      void refresh();
      setInterval(refresh, 10000);
    })();
  </script>
</body>
</html>`;
