(function () {
  const API = window.PHOTOBOX_API;
  const $ = id => document.getElementById(id);
  const W = 1080, H = 1440; // ukuran foto final (rasio 3:4, sama dengan area kamera)
  const S = { stream: null, facing: 'user', frames: [], frame: null, frameImg: null, result: null, busy: false, cfg: {} };

  function msg(html, hide) { const m = $('msg'); m.innerHTML = html || ''; m.classList.toggle('hide', !!hide); }
  function status(html) { $('status').innerHTML = html || ''; }

  /* ---------- Kamera ---------- */
  async function startCamera() {
    stopCamera();
    $('btnShoot').disabled = true;
    msg('<div><span class="spin"></span>Menyiapkan kamera…</div>');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return msg('Browser tidak mendukung kamera, atau halaman tidak memakai HTTPS. Buka lewat alamat https:// (GitHub Pages).');
    }
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: S.facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false
      });
      const v = $('video');
      v.srcObject = S.stream;
      v.classList.toggle('mirror', S.facing === 'user');
      await v.play();
      msg('', true);
      $('btnShoot').disabled = false;
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      msg(denied
        ? 'Izin kamera ditolak.<br>Ketuk ikon gembok di address bar → izinkan Kamera → muat ulang halaman.'
        : 'Kamera tidak ditemukan atau sedang dipakai aplikasi lain.<br>(' + (e.name || 'error') + ')');
    }
  }
  function stopCamera() { if (S.stream) S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }

  /* ---------- Frame ---------- */
  function loadImg(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }

  async function selectFrame(f) {
    S.frame = f;
    S.frameImg = f ? await loadImg(f.data) : null;
    const o = $('overlay');
    o.hidden = !f; if (f) o.src = f.data;
    document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('sel', f && t.dataset.id === f.id));
  }

  function buildGallery() {
    const g = $('gallery'); g.innerHTML = '';
    if (!S.frames.length) { g.textContent = 'Belum ada frame. Admin: upload PNG ke folder frame di Google Drive.'; return; }
    S.frames.forEach(f => {
      const b = document.createElement('button');
      b.className = 'thumb'; b.dataset.id = f.id; b.type = 'button';
      b.innerHTML = '<img alt=""><span></span>';
      b.firstChild.src = f.data; b.lastChild.textContent = f.name;
      b.onclick = () => selectFrame(f);
      g.appendChild(b);
    });
  }

  /* ---------- Countdown, suara, ambil foto ---------- */
  function beep(freq, dur) {
    try {
      const c = S.ac || (S.ac = new (window.AudioContext || window.webkitAudioContext)());
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq; g.gain.value = .15;
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur);
    } catch (e) {}
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function shoot() {
    if (S.busy) return; S.busy = true;
    $('btnShoot').disabled = true; $('btnSwitch').disabled = true;
    const c = $('count'); c.hidden = false;
    for (const n of ['3', '2', '1']) { c.textContent = n; beep(660, .08); await wait(1000); }
    c.textContent = '📸'; beep(1200, .15); await wait(250);
    c.hidden = true;
    capture();
    S.busy = false; $('btnShoot').disabled = false; $('btnSwitch').disabled = false;
  }

  function capture() {
    const v = $('video'), cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const s = Math.max(W / v.videoWidth, H / v.videoHeight); // meniru object-fit: cover
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    x.save();
    if (S.facing === 'user') { x.translate(W, 0); x.scale(-1, 1); } // selfie tidak terbalik
    x.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    x.restore();
    if (S.frameImg) x.drawImage(S.frameImg, 0, 0, W, H);        // frame menyatu dengan foto
    S.result = cv.toDataURL('image/jpeg', 0.92);
    $('resultImg').src = S.result;
    status('');
    $('btnSave').disabled = false;
    $('camView').hidden = true; $('resultView').hidden = false;
  }

  /* ---------- Hasil: ulang, download, bagikan, simpan ---------- */
  function retake() { $('resultView').hidden = true; $('camView').hidden = false; S.result = null; }

  function download() {
    const a = document.createElement('a');
    a.href = S.result; a.download = 'PhotoBox_' + Date.now() + '.jpg';
    document.body.appendChild(a); a.click(); a.remove();
  }

  async function share() {
    try {
      const blob = await (await fetch(S.result)).blob();
      const file = new File([blob], 'PhotoBox.jpg', { type: 'image/jpeg' });
      await navigator.share({ files: [file], title: S.cfg.appName });
    } catch (e) {}
  }

  async function saveDrive() {
    $('btnSave').disabled = true; status('Menyimpan…');
    try {
      // text/plain = "simple request", tidak memicu preflight CORS di Apps Script
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'save', image: S.result }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Gagal');
      status('✅ Tersimpan: <a target="_blank" rel="noopener" href="' + d.file.url + '">' + d.file.name + '</a>');
    } catch (e) {
      $('btnSave').disabled = false; status('❌ Gagal menyimpan: ' + (e.message || e));
    }
  }

  /* ---------- Init ---------- */
  async function loadData() {
    const g = $('gallery');
    if (!API || API.indexOf('PASTE_') === 0) { g.textContent = 'Admin: isi PHOTOBOX_API di docs/config.js.'; return; }
    g.textContent = 'Memuat frame…';
    try {
      const d = await (await fetch(API + '?action=frames')).json();
      if (d.error) throw new Error(d.error);
      S.cfg = d; S.frames = d.frames;
      $('title').textContent = d.appName; document.title = d.appName;
      $('btnDownload').hidden = !d.allowDownload;
      $('btnSave').hidden = !d.allowSaveToDrive;
      buildGallery();
      if (S.frames.length) selectFrame(S.frames[0]);
    } catch (e) {
      g.textContent = 'Gagal memuat frame: ' + (e.message || e) + ' (cek URL Web App & akses "Anyone")';
    }
  }

  function init() {
    $('btnShoot').onclick = shoot;
    $('btnSwitch').onclick = () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; startCamera(); };
    $('btnRetake').onclick = retake;
    $('btnDownload').onclick = download;
    $('btnSave').onclick = saveDrive;
    $('btnShare').onclick = share;
    $('btnShare').hidden = !(navigator.canShare && navigator.share);
    startCamera();
    loadData();
  }
  init();
})();
