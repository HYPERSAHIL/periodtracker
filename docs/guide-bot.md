# Guide bot — backend status (no LLM wired)

`src/lib/guide.ts` ships a deterministic offline engine: 8 intent templates
(late, pain, ttc, peri, postpartum, contraception, mood, privacy) personalized
with live stats, plus keyword fallback over Learn articles. Zero network, zero
cost, private by construction.

## Plugging an LLM later

```ts
import { registerGuideProvider } from './lib/guide';
registerGuideProvider({
  async answer(q, { entries, settings }) {
    // call your provider here; NEVER send entries wholesale —
    // send only the question + aggregate stats, keep raw logs on-device
    return { text: '...', articles: ['slug', ...], disclaimer: true };
  },
});
```

Rules for any provider: on-device first, aggregates only, articles must be
slugs from `content.ts`, always keep the non-diagnostic disclaimer.

## Free LLM keys (checked 2026-09-05)

| Provider | Free tier | Signup |
|---|---|---|
| Groq | Generous free tier, no card | https://console.groq.com/signup |
| Deepgram | $200 credit | https://console.deepgram.com/signup |
| AssemblyAI | $50 credit | https://www.assemblyai.com/dashboard/signup |
| Google AI Studio (Gemini) | Free tier | https://aistudio.google.com/ |

Recommended when ready: Groq (fast + free) behind the app's own backend
proxy — never ship keys in the PWA bundle.
