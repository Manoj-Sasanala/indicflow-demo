# IndicFlow — speech engine demo

A browser demo of the speech engine behind **[IndicFlow](https://github.com/Manoj-Sasanala/IndicFlow)**,
a system-wide voice-dictation app for Windows.

The full product needs a desktop OS: a global hotkey, caret tracking and typing into
any application. This demo keeps the part that works in a browser — record speech,
send it to **Gnani AI Prisma STT v3.0**, and show the transcript. It is a demo of the
engine, not a replacement for the app.

## Run locally

```bash
# Node 22.5+ (built-in fetch, FormData and Blob — no dependencies)
export GNANI_API_KEY=your_key_here     # PowerShell: $env:GNANI_API_KEY="..."
node server.js
# open http://localhost:3000
```

The key is read from the environment and never reaches the browser: the page posts
audio to `/api/transcribe`, and the server makes the Gnani request.

## Deploy

Any Node host works. On Render: create a Web Service from this repo, build command
`npm install` (nothing to install, it is instant), start command `node server.js`,
and set `GNANI_API_KEY` in the environment.

On Vercel the same code needs to move into `api/transcribe.js`; the 10 s function
limit on the free plan caps clip length.

## Limits

- 6 MB per recording (about 3 minutes of 16 kHz mono WAV).
- 6 requests per minute per IP — the endpoint spends a real API key, so a public
  link needs this.
- Clips are converted to 16 kHz mono PCM WAV in the browser before upload.

## How it works

1. `getUserMedia` captures the microphone; a `ScriptProcessorNode` buffers PCM.
2. On stop the buffer is averaged down to 16 kHz and wrapped in a RIFF/WAVE header.
3. `POST /api/transcribe` forwards it to Prisma as multipart form data.
4. The transcript is rendered in the page.

## License

MIT.
