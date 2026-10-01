(function () {
  const API = window.PHOTOBOX_API;
  const $ = id => document.getElementById(id);
  const S = { stream: null, facing: 'user', frames: [], frame: null, frameImg: null, result: null, busy: false, cfg: {},
              mode: 'camera', photo: null, zoom: 1, ox: 0, oy: 0, W: 1080, H: 1440 };

  function msg(html, hide) { const m = $('msg'); m.innerHTML = html || ''; m.classList.toggle('hide', !!hide); }
  function status(html) { $('status').innerHTML = html || ''; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function loadImg(src) { return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }); }

  /* ---------- Ukuran mengikuti rasio frame ---------- */
  function setSize(w, h) {
    S.W = w; S.H = h;
    document.documentElement.style.setProperty('--ar', w + ' / ' + h);
    const pc = $('pc'); pc.width = w; pc.height = h;
    if (S.mode === 'photo') renderPhoto();
  }

  /* ---------- Kamera ---------- */
  async function startCamera() {
    stopCamera();
    $('btnShoot').disabled = true;
    msg('<div><span class="spin"></span>Menyiapkan kamera…</div>');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return msg('Browser tidak mendukung kamera, atau halaman tidak memakai HTTPS. Buka lewat alamat https://.');
    }
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: S.facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false
      });
      const v = $('video');
      v.srcObject = S.stream;
      v.classList.toggle('mirror', S.facing === 'user');
      await v.play();
      if (S.mode !== 'camera') return stopCamera();
      msg('', true);
      $('btnShoot').disabled = false;
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      msg(denied
        ? 'Izin kamera ditolak.<br>Ketuk ikon gembok di address bar → izinkan Kamera → muat ulang halaman.<br>Atau pakai tombol 🖼️ Galeri.'
        : 'Kamera tidak ditemukan atau sedang dipakai aplikasi lain.<br>Anda tetap bisa memakai 🖼️ Galeri.<br>(' + (e.name || 'error') + ')');
    }
  }
  function stopCamera() { if (S.stream) S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }

  /* ---------- Mode kamera / galeri ---------- */
  function setMode(m) {
    S.mode = m;
    const ph = m === 'photo';
    $('video').style.display = ph ? 'none' : '';
    $('pc').hidden = !ph; $('zoomRow').hidden = !ph; $('hint').hidden = !ph;
    $('btnSwitch').hidden = ph; $('btnCam').hidden = !ph;
    $('btnShoot').textContent = ph ? '✅ Gunakan Foto' : '📷 Ambil Foto';
    if (ph) { stopCamera(); msg('', true); $('btnShoot').disabled = false; renderPhoto(); }
    else startCamera();
  }

  async function pickPhoto(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { S.photo = await createImageBitmap(f); }
    catch (err) { return alert('Foto tidak bisa dibuka. Coba foto lain (JPG/PNG).'); }
    S.zoom = 1; S.ox = S.oy = 0; $('zoom').value = 1;
    setMode('photo');
  }

  /* Gambar dasar (video atau foto galeri) memenuhi kanvas, meniru object-fit: cover */
  function drawBase(x) {
    const W = S.W, H = S.H;
    x.fillStyle = '#111'; x.fillRect(0, 0, W, H);
    if (S.mode === 'photo' && S.photo) {
      const p = S.photo, k = Math.max(W / p.width, H / p.height) * S.zoom;
      const dw = p.width * k, dh = p.height * k, mx = (dw - W) / 2, my = (dh - H) / 2;
      S.ox = Math.max(-mx, Math.min(mx, S.ox)); S.oy = Math.max(-my, Math.min(my, S.oy));
      x.drawImage(p, (W - dw) / 2 + S.ox, (H - dh) / 2 + S.oy, dw, dh);
    } else {
      const v = $('video');
      if (!v.videoWidth) return;
      const k = Math.max(W / v.videoWidth, H / v.videoHeight), dw = v.videoWidth * k, dh = v.videoHeight * k;
      x.save();
      if (S.facing === 'user') { x.translate(W, 0); x.scale(-1, 1); } // selfie tidak terbalik
      x.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      x.restore();
    }
  }
  function renderPhoto() { drawBase($('pc').getContext('2d')); }

  function bindDrag() {
    const pc = $('pc'); let d = null;
    pc.onpointerdown = e => { d = { x: e.clientX, y: e.clientY, ox: S.ox, oy: S.oy }; pc.setPointerCapture(e.pointerId); };
    pc.onpointermove = e => {
      if (!d) return;
      const f = S.W / pc.getBoundingClientRect().width;
      S.ox = d.ox + (e.clientX - d.x) * f; S.oy = d.oy + (e.clientY - d.y) * f; renderPhoto();
    };
    pc.onpointerup = pc.onpointercancel = () => { d = null; };
    $('zoom').oninput = e => { S.zoom = +e.target.value; renderPhoto(); };
  }

  /* ---------- Frame ---------- */
  async function selectFrame(f) {
    S.frame = f;
    S.frameImg = f ? await loadImg(f.data) : null;
    if (S.frameImg) { // kamera & hasil mengikuti rasio frame (maks 1920 px)
      const nw = S.frameImg.naturalWidth, nh = S.frameImg.naturalHeight, k = Math.min(1, 1920 / Math.max(nw, nh));
      setSize(Math.round(nw * k), Math.round(nh * k));
    } else setSize(1080, 1440);
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

  async function onShoot() {
    if (S.mode === 'photo') return capture();
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
    const cv = document.createElement('canvas');
    cv.width = S.W; cv.height = S.H;
    const x = cv.getContext('2d');
    drawBase(x);
    if (S.frameImg) x.drawImage(S.frameImg, 0, 0, S.W, S.H); // frame menyatu dengan foto
    S.result = cv.toDataURL('image/jpeg', 0.92);
    $('resultImg').src = S.result;
    status(''); $('btnSave').disabled = false;
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
    if (!API || API.indexOf('PASTE_') === 0) { g.textContent = 'Admin: isi PHOTOBOX_API di config.js.'; return; }
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
    setSize(S.W, S.H); bindDrag();
    $('btnShoot').onclick = onShoot;
    $('btnSwitch').onclick = () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; startCamera(); };
    $('btnGallery').onclick = () => $('file').click();
    $('file').onchange = pickPhoto;
    $('btnCam').onclick = () => setMode('camera');
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
