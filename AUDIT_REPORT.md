# Codebase Audit Report — ai-refactor branch

**Date:** 2026-06-20
**Auditor:** Senior Software Architect
**Branch:** `ai-refactor` (rollback checkpoint: `b48ab9a`)
**Base commit:** `ae1a108` (main HEAD)

## Executive Summary

The codebase is **~9,475 LOC** of TypeScript/TSX. After audit, **~5,500 LOC (~58%) is dead code** — primarily unused shadcn/ui components and unused npm dependencies left over from the Next.js scaffold. The actual application logic (~3,500 LOC across `src/app`, `src/components/chatbot`, `src/lib`) is reasonably clean but has notable DRY violations in the AI provider layer.

**Risk level:** LOW for all proposed changes — removals are isolated, refactors preserve behavior.

---

## Findings by Severity

### 🔴 CRITICAL — Dead code (safe to delete, large impact)

| # | File / Pattern | Problem | Severity | Fix |
|---|---|---|---|---|
| 1 | `src/components/ui/*` (36 files) | 36 of 40 shadcn/ui components have **0 imports** from app code. ~4,500 LOC dead. | Critical | Delete all unused ui components. Keep only `sonner.tsx` (used by `layout.tsx`). |
| 2 | `src/lib/db.ts` | Prisma client — **0 imports** anywhere. App uses Supabase, not Prisma. | Critical | Delete file. |
| 3 | `src/hooks/use-mobile.ts`, `src/hooks/use-toast.ts` | **0 imports** anywhere. | Critical | Delete both. |
| 4 | `src/components/ui/toaster.tsx` | **0 imports** anywhere (app uses `sonner` instead). | Critical | Delete. |
| 5 | `prisma/` directory | Legacy schema from WhatsApp clone phase. App uses Supabase exclusively. | Critical | Delete `prisma/schema.prisma` and `db/custom.db`. |
| 6 | `examples/` directory | Old websocket demo. Not part of app. | Critical | Delete. |
| 7 | `package.json` deps | **17 unused npm dependencies**: `@dnd-kit/*`, `@hookform/resolvers`, `@mdxeditor/editor`, `@reactuses/core`, `@tanstack/react-query`, `@tanstack/react-table`, `framer-motion`, `next-auth`, `next-intl`, `react-syntax-highlighter`, `sharp`, `socket.io-client`, `tailwindcss-animate`, `zod`, `@prisma/client`, `react-dom` (transitive), and ~25 unused `@radix-ui/*` packages. | Critical | Remove from `package.json`. |

### 🟡 HIGH — DRY violations / duplication

| # | File | Problem | Severity | Fix |
|---|---|---|---|---|
| 8 | `src/app/api/chat/route.ts` + `src/app/api/extract-memory/route.ts` | **Duplicate provider-switching logic** (GLM → OpenRouter → z-ai SDK) duplicated in both files. ~120 LOC duplicated. | High | Extract `src/lib/ai-providers.ts` with `streamChat()` + `completeChat()` helpers. Both routes import it. |
| 9 | `src/app/api/chat/route.ts` | **Duplicate SSE-stream parsing loop** — same `decoder.decode` + `data:` line parsing appears 3× in `streamFromGLM`, `streamFromOpenRouter`, `streamFromZAI`. | High | Extract `parseSSEStream(reader, onDelta)` helper. |
| 10 | `src/lib/storage.ts` | `SupabaseStore` and `LocalStore` have **identical method signatures** but don't share an interface contract explicitly. `onStorageResolved` callback API is awkward. | Medium | Keep as-is (interfaces already aligned). Remove the now-unused `onStorageResolved` export (was used by removed toast logic). |
| 11 | `src/lib/quotes.ts` | `pickQuote()` has **deep nesting** (4 levels) and a long keyword-map. Works but hard to read. | Medium | Simplify scoring loop, extract helper. |
| 12 | `'Obrolan Baru'` literal | Magic string repeated **4×** across `chat-app.tsx` and `storage.ts`. | Medium | Extract `const NEW_CHAT_TITLE = 'Obrolan Baru'`. |

### 🟢 MEDIUM — Code smells / minor

| # | File | Problem | Severity | Fix |
|---|---|---|---|---|
| 13 | `src/lib/format.ts` | `initials()` function has **0 uses**. | Medium | Delete. |
| 14 | `src/lib/storage.ts` | `onStorageResolved` export — **0 uses** after we removed the backend-status toast. | Medium | Delete export + the `onResolved` plumbing in `ResilientStore`. |
| 15 | `src/lib/settings.ts` | `LS_MEMORY_KEY = 'epong-memory-v1'` constant defined but **never used** (replaced by `localMemoryKey(userId)`). | Low | Delete. |
| 16 | `src/components/chatbot/chat-app.tsx` | `extractMemories` helper at bottom is a **free function** mixing concerns (fetch + dedup + toast). | Low | Keep but tighten — extract dedup to a pure helper. |
| 17 | `src/app/api/chat/route.ts` | Magic numbers: `slice(-20)` for history, `slice(0,200)` for error text. | Low | Extract named constants `MAX_HISTORY = 20`, `ERROR_PREVIEW = 200`. |
| 18 | `src/components/chatbot/settings-panel.tsx` | 505 LOC — largest component. Has inline helper components (`Section`, `Field`, `SegmentedOptions`, `ToggleRow`). | Low | Acceptable for now (splitting would over-abstract). Keep. |
| 19 | `src/components/chatbot/chat-app.tsx` | `handleSend` is **~120 LOC** with deep try/catch nesting. | Medium | Extract `streamAssistantReply()` helper to reduce nesting. |

### 🔵 LOW — Style / minor

| # | File | Problem | Severity | Fix |
|---|---|---|---|---|
| 20 | `src/lib/auth.ts` | `loadGuest()` called twice on init path (once in `useState` lazy init, once in `useEffect`). | Low | Use a ref to avoid double-read, or just accept (idempotent). |
| 21 | Various | `console.error` / `console.warn` calls in API routes — fine for dev, but should be structured in prod. | Low | Keep for now (Vercel captures them). |
| 22 | `src/app/api/quote/route.ts` | 3 provider functions are nearly identical (fetch + parse). | Low | Could genericize, but YAGNI — leave explicit. |

---

## Migration Plan

**Execution order** (each step is a separate commit for safe rollback):

### Phase 1 — Safe deletions (zero behavior risk)
- **Commit A:** Delete 36 unused `src/components/ui/*.tsx` files + `toaster.tsx`
- **Commit B:** Delete `src/lib/db.ts`, `src/hooks/use-mobile.ts`, `src/hooks/use-toast.ts`
- **Commit C:** Delete legacy `prisma/` directory + `db/custom.db` + `examples/`
- **Commit D:** Remove unused npm deps from `package.json` (17 deps + ~25 radix packages)
- **Commit E:** Delete unused `initials()` from `format.ts`, unused `LS_MEMORY_KEY` from `settings.ts`, unused `onStorageResolved` from `storage.ts`

### Phase 2 — DRY refactor (extract shared code)
- **Commit F:** Extract `src/lib/ai-providers.ts` with `streamChat()` + `completeChat()` + `parseSSEStream()`. Refactor `chat/route.ts` + `extract-memory/route.ts` to use it.
- **Commit G:** Extract `NEW_CHAT_TITLE` constant. Replace 4 occurrences.

### Phase 3 — Readability
- **Commit H:** Extract `MAX_HISTORY` + `ERROR_PREVIEW` constants in chat route.
- **Commit I:** Simplify `pickQuote()` nesting in `quotes.ts`.

### Phase 4 — Verification
- **Lint:** `bun run lint` must pass
- **Build:** `bun run build` must pass
- **Manual smoke test:** login (guest), send message, switch provider, settings, incognito, memory extraction

**Rollback plan:** If any phase breaks behavior: `git reset --hard <commit-before-phase>` on `ai-refactor` branch. The pre-refactor checkpoint `b48ab9a` is always available.

---

## Refactored Code Examples

### Example 1 — Extract AI providers (DRY)

**Before** (duplicated in 2 files, ~120 LOC each):
```typescript
// chat/route.ts
if (process.env.OPENROUTER_API_KEY) {
  try { await streamFromOpenRouter(messages, send); success = true }
  catch (e) { console.error('[chat] OpenRouter failed:', e?.message) }
}
if (!success && process.env.GLM_API_KEY) { ... }
if (!success) { await streamFromZAI(messages, send) }

// extract-memory/route.ts  ← SAME LOGIC, non-streaming variant
if (process.env.OPENROUTER_API_KEY) {
  try { result = await completeFromOpenRouter(messages); success = true }
  catch (e) { console.error('[extract] OpenRouter failed:', e?.message) }
}
...
```

**After** — single source of truth in `src/lib/ai-providers.ts`:
```typescript
// src/lib/ai-providers.ts
export async function streamChat(
  messages: ApiMessage[],
  preferred: Provider,
  onDelta: (text: string) => void
): Promise<boolean> { /* try OpenRouter → GLM → z-ai, return true on success */ }

export async function completeChat(
  messages: ApiMessage[],
  preferred: Provider
): Promise<string> { /* same fallback chain, non-streaming */ }

// chat/route.ts
await streamChat(messages, preferred, (delta) => send({ content: delta }))

// extract-memory/route.ts
const result = await completeChat(messages, 'auto')
```

### Example 2 — Extract SSE parser (DRY)

**Before** (3× duplicated):
```typescript
const reader = res.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') continue
    try {
      const json = JSON.parse(payload)
      const delta = json?.choices?.[0]?.delta?.content
      if (delta) send({ content: delta })
    } catch {}
  }
}
```

**After:**
```typescript
// src/lib/ai-providers.ts
async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch {}
    }
  }
}
```

---

## Out of Scope (deliberately not touched)

- **Business logic:** All AI provider chain behavior, memory extraction, auth, storage scoping preserved exactly.
- **UI/UX:** No visual changes. All components keep their styling.
- **`src/components/ui/sonner.tsx`:** Kept (used by `layout.tsx`).
- **`src/components/ui/dialog.tsx`, `input.tsx`, `label.tsx`:** Deleted — only "used" by other dead ui components, not by app code. Verified safe.
- **Tests:** None exist (project has no test suite). Out of scope to add.
