'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GNANI_API_KEY || '';
const ENDPOINT = process.env.GNANI_ENDPOINT || 'https://api.vachana.ai/stt/v3';
const MODEL = process.env.GNANI_MODEL || 'prisma-v3.0';

const MAX_BYTES = 6 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 6;

const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
};

const recent = new Map();

function overLimit(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_REQUESTS) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  return false;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}

async function transcribe(req, res, language) {
  if (!API_KEY) {
    sendJson(res, 500, { error: 'GNANI_API_KEY is not set on the server' });
    return;
  }
  if (overLimit(req.socket.remoteAddress || 'unknown')) {
    sendJson(res, 429, { error: 'Too many requests — wait a minute and try again.' });
    return;
  }

  let audio;
  try {
    audio = await readBody(req);
  } catch {
    sendJson(res, 413, { error: 'Recording too large (max 6 MB).' });
    return;
  }
  if (audio.length < 1000) {
    sendJson(res, 400, { error: 'No audio received.' });
    return;
  }

  const form = new FormData();
  form.append('audio_file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', MODEL);
  form.append('language_code', language || 'en-IN');

  try {
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key-ID': API_KEY },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await upstream.text();
    if (!upstream.ok) {
      sendJson(res, 502, { error: `Gnani HTTP ${upstream.status}`, detail: raw.slice(0, 300) });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 502, { error: 'Unreadable Gnani response' });
      return;
    }
    sendJson(res, 200, {
      text: (parsed.transcript || parsed.text || parsed.full_transcript || '').trim(),
      language: parsed.detected_language_code || null,
      model: parsed.model || MODEL,
    });
  } catch (err) {
    sendJson(res, 502, { error: 'Transcription failed', detail: String(err.message || err) });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    await transcribe(req, res, url.searchParams.get('lang'));
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(res, url.pathname);
    return;
  }
  res.writeHead(405, { 'content-type': 'text/plain' });
  res.end('method not allowed');
});

server.listen(PORT, () => {
  console.log(`indicflow-demo listening on http://localhost:${PORT}`);
});
