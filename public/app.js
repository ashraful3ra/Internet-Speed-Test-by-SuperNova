const $ = (id) => document.getElementById(id);
const log = (m) => ($('log').textContent += m + '\n');

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function randomBytes(total) {
  const buf = new Uint8Array(total);
  const step = 65536; // 64KB limit
  for (let i = 0; i < total; i += step) {
    crypto.getRandomValues(buf.subarray(i, Math.min(i + step, total)));
  }
  return buf;
}

async function testPing(times = 7) {
  const rtts = [];
  for (let i = 0; i < times; i++) {
    const t0 = performance.now();
    await fetch('/api/ping?cb=' + Math.random(), { cache: 'no-store' });
    const t1 = performance.now();
    rtts.push(t1 - t0);
    await new Promise(r => setTimeout(r, 100));
  }
  const med = median(rtts);
  $('latency').textContent = med.toFixed(0);
  log('Ping samples (ms): ' + rtts.map(x => x.toFixed(1)).join(', '));
  return med;
}

function mbps(bytes, ms) {
  const bits = bytes * 8;
  const mbits = bits / 1e6;
  return mbits / (ms / 1000);
}

async function testDownload({ durationSec = 10, parallel = 4, chunkMB = 20, updateUI = true }) {
  const endAt = performance.now() + durationSec * 1000;
  let bytes = 0;

  async function worker(i) {
    while (performance.now() < endAt) {
      const url = `/api/download?size=${chunkMB * 1024 * 1024}&cb=${Math.random()}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok || !res.body) break;
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (updateUI) {
          const elapsed = (performance.now() - (endAt - durationSec * 1000));
          const current = mbps(bytes, Math.max(1, elapsed));
          $('speedNumber').textContent = Math.max(0, current).toFixed(0);
        }
        if (performance.now() > endAt) { try { reader.cancel(); } catch (e) { } break; }
      }
    }
  }

  const tStart = performance.now();
  await Promise.all([...Array(parallel)].map((_, i) => worker(i + 1)));
  const tElapsed = performance.now() - tStart;
  const speed = mbps(bytes, tElapsed);
  $('speedNumber').textContent = speed.toFixed(0);
  log(`Download: ${bytes} bytes in ${tElapsed.toFixed(0)}ms => ${speed.toFixed(2)} Mbps`);
  return speed;
}

async function testUpload({ durationSec = 10, parallel = 3, payloadMB = 2 }) {
  const endAt = performance.now() + durationSec * 1000;
  let bytes = 0;
  const payload = new Blob([randomBytes(payloadMB * 1024 * 1024)]);

  async function worker(i) {
    while (performance.now() < endAt) {
      const res = await fetch('/api/upload?cb=' + Math.random(), {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' }
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Upload HTTP ' + res.status + ' ' + txt.slice(0, 200));
      }
      const json = await res.json();
      bytes += json.received || payload.size;

      // live UI update for upload speed
      const elapsed = durationSec * 1000 - Math.max(0, endAt - performance.now());
      const current = mbps(bytes, Math.max(1, elapsed));
      $('upload').textContent = current.toFixed(1);
    }
  }

  const tStart = performance.now();
  await Promise.all([...Array(parallel)].map((_, i) => worker(i + 1)));
  const tElapsed = performance.now() - tStart;
  const speed = mbps(bytes, tElapsed);
  $('upload').textContent = speed.toFixed(1);
  log(`Upload: ${bytes} bytes in ${tElapsed.toFixed(0)}ms => ${speed.toFixed(2)} Mbps`);
  return speed;
}

let running = false;

async function runAll() {
  if (running) return;
  running = true;
  const btn = $('toggle');
  btn.textContent = 'Testing…';
  btn.disabled = true;

  $('log').textContent = '';
  $('speedNumber').textContent = '—';
  $('upload').textContent = '—';
  $('latency').textContent = '—';

  const durationSec = Math.max(5, parseInt($('duration').value || '10', 10));
  const parallel = Math.min(8, Math.max(1, parseInt($('parallel').value || '4', 10)));
  const chunkMB = Math.max(5, parseInt($('chunksize').value || '20', 10));
  const uploadMB = Math.max(1, parseInt($('uploadmb').value || '2', 10));

  try {
    await testPing();
    await testDownload({ durationSec, parallel, chunkMB });
    await testUpload({ durationSec, parallel: Math.max(2, Math.floor(parallel / 1.5)), payloadMB: uploadMB });
  } catch (e) {
    log('Error: ' + (e?.message || e));
  } finally {
    running = false;
    btn.textContent = 'Start Test';
    btn.disabled = false;
  }
}

$('toggle').addEventListener('click', () => {
  if (!running) runAll();
});

document.addEventListener('DOMContentLoaded', () => {
  $('serverInfo').textContent = location.host;
});
