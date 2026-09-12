# API-key security design (guide bot + voice STT)

## The threat (user's question, answered)

Yes — if the app called an LLM/STT API directly from the browser with an
embedded key, anyone could extract the key from the bundle/network tab and
burn it on coding questions or anything else. So: **the key must never reach
the client.** Design:

```
PWA ──(question, aggregate stats only)──> OUR backend ──(keyed call)──> Groq/etc
  ▲                                           │
  │ rejects off-topic + rate-limits           │ system prompt locks scope
  │ before any paid call                      │ to women's health
```

## Enforcement layers (defense in depth)

1. **Client-side topic guard** (`guide.ts`, shipped): off-topic questions
   (coding, homework, general chat) get a polite refusal + redirect WITHOUT
   any network call. Zero cost, works offline.
2. **Backend proxy** (to build when a key exists): Cloudflare Worker holds the
   key as a secret. It (a) re-checks topic with a cheap classifier pass,
   (b) injects a system prompt restricting to menstrual/reproductive health +
       explicit refusal for everything else,
   (c) rate-limits per user/day, caps tokens, strips PII from logs.
3. **No raw logs leave the device**: proxy receives only the question plus
   aggregate stats (cycle day, phase) — never entries/symptoms/notes.
4. **STT same pattern**: short notes stay on Web Speech; long dictation posts
   audio to the proxy (Groq Whisper), never with a client-side key.

## What to do when holding a key

1. `wrangler secret put GROQ_KEY` on a new `guide-proxy` worker.
2. Add optional Settings → key *presence* indicator (never the key itself).
3. `registerGuideProvider()` points at the proxy URL.
4. Monitor spend: daily cap + alert at 80%.
