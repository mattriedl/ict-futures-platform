# 03 — AI / LLM Integration

The app uses a Large Language Model (LLM) to generate natural-language explanations of detected ICT setups and to produce an AI confluence "score" narrative. All AI access is routed through a single module, **`lib/llm.ts`**, which talks to an **OpenAI-compatible** chat-completions endpoint. This means you can point the app at **any** OpenAI-compatible provider (Abacus RouteLLM, OpenAI, OpenRouter, Together, a self-hosted vLLM/Ollama gateway, etc.) by changing environment variables only — no code changes.

---

## 1. Environment variables

| Variable | Purpose | Example |
|---|---|---|
| `LLM_BASE_URL` | Base URL of the OpenAI-compatible API. **Must include the `/v1` path** for most providers. | `https://routellm.abacus.ai/v1` |
| `LLM_API_KEY` | API key / bearer token for the provider. If unset, the code falls back to `ABACUSAI_API_KEY`. | `sk-...` |
| `LLM_MODEL` | Model name to request. | `gpt-4o-mini`, `route-llm`, `claude-3-5-sonnet` |
| `ABACUSAI_API_KEY` | Fallback key used when `LLM_API_KEY` is empty (Abacus-hosted convenience). | (VM-provided) |

Set these in `.env` (local/VPS) or in your container/orchestrator secrets. See `docs/02-configuration.md` for the full env matrix.

---

## 2. Which API endpoints use the LLM

| App endpoint | What it does |
|---|---|
| `POST /api/ai/explain` | Plain-language explanation of a specific detected setup/pattern. |
| `POST /api/ai/score` | AI confluence commentary tied to the numeric confluence score. |
| `GET /api/ai/history` | Returns stored past AI responses for a user/setup. |

The AI calls are **non-blocking for trading** — the autotrader and the deterministic ICT engine do **not** depend on the LLM. If the LLM is down, charts, detection, scoring (numeric), and autotrading continue to work; only the written explanations are affected.

---

## 3. Pointing the app at a different provider (portability)

Because everything is env-driven, migration is just reconfiguration:

**OpenAI**
```env
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-openai-key
LLM_MODEL=gpt-4o-mini
```

**Abacus RouteLLM** (works only with a valid Abacus key; the VM-injected key is valid only on the Abacus VM)
```env
LLM_BASE_URL=https://routellm.abacus.ai/v1
LLM_API_KEY=your-abacus-api-key
LLM_MODEL=route-llm
```

**Self-hosted (Ollama / vLLM / LM Studio)**
```env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=not-needed
LLM_MODEL=llama3.1
```

After changing any of these, restart the app process so the new environment is loaded (`sudo systemctl restart ict-futures`, or your container restart).

---

## 4. Troubleshooting

### 402 "subscription ended" / payment required
This means the key and/or base URL are wrong for the provider. The most common cause seen on this app was an incorrect base URL plus a stale key:

- **Wrong:** `LLM_BASE_URL=https://apps.abacus.ai` (this is the web app host, not the API, and has no `/v1`).
- **Correct:** `LLM_BASE_URL=https://routellm.abacus.ai/v1` with a current key.

On the Abacus VM the valid key is injected by the platform (VM metadata). **That key is only valid on the Abacus VM** — when you migrate to your own server you MUST supply your own provider key.

### 401 Unauthorized
Key is missing or invalid. Confirm `LLM_API_KEY` (or `ABACUSAI_API_KEY` fallback) is set in the running environment: `sudo systemctl show ict-futures -p Environment` or check the process `.env`.

### 404 / "model not found"
`LLM_MODEL` is not offered by the configured provider. Use a model name the provider actually supports.

### Connection refused / timeout
`LLM_BASE_URL` host is unreachable from the server (firewall, wrong port for a self-hosted gateway). Test with:
```bash
curl -s $LLM_BASE_URL/models -H "Authorization: Bearer $LLM_API_KEY"
```

### Explanations are empty but no error
Check app logs (`journalctl -u ict-futures -n 100`) — the module logs provider errors. The UI degrades gracefully, so a silent failure is usually a provider-side rate limit or an empty completion.

---

## 5. Security notes

- The LLM key is a server-side secret. It is read only in `lib/llm.ts` (server) and never shipped to the browser.
- Keep it out of git — `.env` is gitignored. Never hardcode a key in source.
- Rotate the key if it was ever committed, logged, or shared.
