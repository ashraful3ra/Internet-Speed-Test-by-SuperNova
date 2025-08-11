// server.js
const express = require('express');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');

app.use(express.static('public', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.post('/api/upload', (req, res) => {
  let bytes = 0;
  req.on('data', chunk => { bytes += chunk.length; });
  req.on('aborted', () => console.warn('Upload aborted at', bytes, 'bytes'));
  req.on('end', () => {
    console.log('Upload received', bytes, 'bytes');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ received: bytes });
  });
});

app.get('/api/download', (req, res) => {
  const total = Math.max(1, parseInt(req.query.size || 20 * 1024 * 1024, 10));
  const chunkSize = 64 * 1024;
  let sent = 0;

  res.set({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': total,
  });

  function push() {
    while (sent < total) {
      const remaining = total - sent;
      const size = Math.min(chunkSize, remaining);
      const buf = crypto.randomBytes(size);
      const canContinue = res.write(buf);
      sent += size;
      if (!canContinue) {
        res.once('drain', push);
        return;
      }
    }
    res.end();
  }
  push();
});

app.get('/api/ping', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ t: Date.now() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Speedtest server on :' + PORT));
