# Voice input — status and options (checked 2026-09-05)

Shipped: DaySheet note dictation via the **Web Speech API** — free, no key,
`hi-IN`/`en-IN` from the app language. Hidden where unsupported. Note: Chrome
sends audio to Google servers, so it is opt-in per tap, never ambient.

## Free STT landscape

| Option | Cost/key | Offline? | Hindi? | Role |
|---|---|---|---|---|
| Web Speech API | Free, no key | No (Google cloud) | Yes (hi-IN) | Shipped default |
| Groq Whisper | Free ~8h/day; $0.04/hr; key | No | Excellent, Hinglish king | Cloud fallback when key exists |
| Deepgram | $200 credit; ~$0.3/hr; key | No | Good | Eval alternative |
| AssemblyAI | $50 credit; $0.15–0.45/hr; key | No | Good | Eval alternative |
| Vosk small-hi/en-in | Free, no key | Yes (36–42MB) | Fair | True-offline Capacitor path |
| transformers.js tiny/base | Free, no key | Yes after download | Good | PWA offline upgrade |
| Gladia / Lemonfox | €50 / 1-mo free | No | Good | Budget cloud alternates |
| wit.ai | Free (Meta) | No | Yes, 20s cap | Skipped (health privacy) |

Signups: Groq https://console.groq.com/signup · Deepgram
https://console.deepgram.com/signup · AssemblyAI
https://www.assemblyai.com/dashboard/signup · Gladia https://app.gladia.io/signup
· Lemonfox https://www.lemonfox.ai/signup

## Next steps when a key exists

1. Add an optional `stt` section to Settings (provider + key field, stored
   locally, never synced).
2. Route long dictation through Groq `whisper-large-v3-turbo` via backend
   proxy; keep Web Speech for short notes.
3. Capacitor: prefer the native SpeechRecognizer plugin (WebView mic is
   flaky) with Vosk small models bundled for offline.
