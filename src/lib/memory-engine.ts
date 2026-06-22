/**
 * Memory Engine — Hierarchical memory system with semantic search,
 * consolidation, emotional tracking, and relationship depth.
 *
 * Levels:
 *   core        — Always injected. Identity, nicknames, strong preferences.
 *   long-term   — Injected when relevant. Facts, projects, ongoing context.
 *   contextual  — Injected when matching. Recent topics, temporary context.
 *   episodic    — Conversation summaries. Injected when topically relevant.
 */

import type { MemoryNote, MemoryLevel } from './settings'

// ── Auto-classify memory level based on content ──

const CORE_PATTERNS = [
  /nama(?:ku| saya| user)? (adalah|itu) /i,
  /panggil (aku|saya|gue) /i,
  /sebut saja /i,
  /tinggal di /i,
  /kerja(?:an)? (di|sebagai|sebagai) /i,
  /suka (banget|sangat) /i,
  /tidak suka|benci /i,
  /lahir (di|pada) /i,
  /ulang tahun /i,
  /pacar|istri|suami|anak|keluarga /i,
  /nama (peliharaan|kucing|anjing) /i,
]

export function classifyMemoryLevel(content: string, category: string): { level: MemoryLevel; priority: number } {
  const isCore = CORE_PATTERNS.some((p) => p.test(content))
  if (isCore || category === 'fakta') {
    return { level: 'core', priority: 9 }
  }
  if (category === 'preferensi') {
    return { level: 'long-term', priority: 7 }
  }
  if (category === 'tujuan') {
    return { level: 'long-term', priority: 6 }
  }
  return { level: 'contextual', priority: 4 }
}

// ── Semantic keyword search ──
// Simple TF-IDF-like keyword matching (no vector DB needed, 0ms).

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
}

function relevanceScore(queryTokens: string[], memoryText: string): number {
  const memTokens = tokenize(memoryText)
  const memSet = new Set(memTokens)
  let score = 0
  for (const qt of queryTokens) {
    if (memSet.has(qt)) score += 1
    // Partial match bonus
    for (const mt of memTokens) {
      if (mt.includes(qt) || qt.includes(mt)) {
        score += 0.3
        break
      }
    }
  }
  return score
}

export function retrieveRelevantMemories(
  allMemory: MemoryNote[],
  query: string,
  maxResults: number = 10
): MemoryNote[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return []

  // Always include ALL core memories (they're always injected)
  const core = allMemory.filter((m) => (m.level || 'long-term') === 'core')

  // Score non-core memories by relevance
  const scored = allMemory
    .filter((m) => (m.level || 'long-term') !== 'core')
    .map((m) => ({
      memory: m,
      score: relevanceScore(queryTokens, m.content) + (m.priority || 5) * 0.1,
    }))
    .filter((s) => s.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.memory)

  return [...core, ...scored]
}

// ── Build memory prompt injection ──

export function buildMemoryPrompt(
  allMemory: MemoryNote[],
  query: string,
  relationshipDepth: number,
  emotionalProfile: string,
  behaviorProfile: string
): string {
  if (allMemory.length === 0 && !behaviorProfile && !emotionalProfile) return ''

  const relevant = retrieveRelevantMemories(allMemory, query)
  if (relevant.length === 0 && !behaviorProfile && !emotionalProfile) return ''

  const parts: string[] = ['\n\n=== MEMORI PERSONAL USER ===']

  // Core memories (always injected)
  const core = relevant.filter((m) => (m.level || 'long-term') === 'core')
  if (core.length > 0) {
    parts.push('Identitas & preferensi inti (SELALU INGAT INI):')
    for (const m of core.slice(0, 10)) {
      parts.push(`- ${m.content}`)
    }
  }

  // Long-term memories (relevant ones)
  const longTerm = relevant.filter((m) => (m.level || 'long-term') === 'long-term')
  if (longTerm.length > 0) {
    parts.push('')
    parts.push('Konteks jangka panjang:')
    for (const m of longTerm.slice(0, 8)) {
      parts.push(`- ${m.content}`)
    }
  }

  // Contextual memories (recent/relevant)
  const contextual = relevant.filter((m) => (m.level || 'long-term') === 'contextual')
  if (contextual.length > 0) {
    parts.push('')
    parts.push('Konteks terkini:')
    for (const m of contextual.slice(0, 5)) {
      parts.push(`- ${m.content}`)
    }
  }

  // Episodic memories (conversation summaries)
  const episodic = relevant.filter((m) => (m.level || 'long-term') === 'episodic')
  if (episodic.length > 0) {
    parts.push('')
    parts.push('Percakapan sebelumnya yang relevan:')
    for (const m of episodic.slice(0, 3)) {
      parts.push(`- ${m.content}`)
    }
  }

  // Relationship depth
  if (relationshipDepth > 0) {
    parts.push('')
    const bond = relationshipDepth < 20 ? 'baru kenal' :
                 relationshipDepth < 40 ? 'sudah akrab' :
                 relationshipDepth < 60 ? 'sangat akrab' :
                 relationshipDepth < 80 ? 'dekat banget' : 'sangat intim dan dekat'
    parts.push(`Tingkat kedekatan: ${relationshipDepth}/100 (${bond}). Sesuaikan keakrabanmu.`)
  }

  // Emotional profile
  if (emotionalProfile) {
    parts.push(`Pola emosi user: ${emotionalProfile}`)
  }

  // Behavior profile
  if (behaviorProfile) {
    parts.push(`Profil komunikasi: ${behaviorProfile}`)
  }

  parts.push('=== AKHIR MEMORI ===')
  parts.push('Gunakan memori ini secara natural. Jangan sebut "saya ingat" kecuali diminta. Jadilah seperti teman yang benar-benar mengenal user.')

  return parts.join('\n')
}

// ── Memory consolidation (merge duplicates) ──

export function consolidateMemories(memories: MemoryNote[]): MemoryNote[] {
  const result: MemoryNote[] = []
  const used = new Set<number>()

  for (let i = 0; i < memories.length; i++) {
    if (used.has(i)) continue
    let current = memories[i]
    for (let j = i + 1; j < memories.length; j++) {
      if (used.has(j)) continue
      const other = memories[j]
      // Check if memories are similar (one contains the other)
      const a = current.content.toLowerCase()
      const b = other.content.toLowerCase()
      if (a.includes(b) || b.includes(a) || similarity(a, b) > 0.7) {
        // Merge: keep the longer one, boost priority
        if (other.content.length > current.content.length) {
          current = { ...other, priority: Math.max(current.priority || 5, other.priority || 5) + 1 }
        } else {
          current = { ...current, priority: (current.priority || 5) + 1 }
        }
        used.add(j)
      }
    }
    result.push(current)
  }

  return result
}

function similarity(a: string, b: string): number {
  const tokensA = new Set(tokenize(a))
  const tokensB = new Set(tokenize(b))
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length
  const union = tokensA.size + tokensB.size - intersection
  return union > 0 ? intersection / union : 0
}

// ── Emotional detection ──

const EMOTION_PATTERNS: Record<string, RegExp[]> = {
  senang: [/senang|gembira|bahagia|happy|hepi|gembira|antusias|excited/i, /😄|😊|😂|🥳|🎉/],
  sedih: [/sedih|bersedih|menangis|kecewa|patah hati|sad|depresi/i, /😢|😭|💔/],
  marah: [/marah|kesal|geram|benci|pusing|nyesek|kesel|angry|mad/i, /😡|🤬|😤/],
  cemas: [/cemas|khawatir|takut|gelisah|anxious|worried|stress|stres/i, /😰|😨|😟/],
  lelah: [/lelah|capek|capai|exhausted|lelah banget|ngantuk/i, /😩|😪|🥱/],
  semangat: [/semangat|motivasi|bersemangat|siap|mari|ayo|gas/i, /💪|🔥|⚡/],
  kasual: [/ santai|rb|cuy|bro|sis|gan|bos|woy/i],
}

export function detectEmotion(text: string): string {
  for (const [emotion, patterns] of Object.entries(EMOTION_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) return emotion
  }
  return 'netral'
}

// ── Relationship depth calculator ──

export function calculateRelationshipDepth(
  totalMessages: number,
  totalConversations: number,
  memoryCount: number,
  currentDepth: number
): number {
  // Each factor contributes to deepening the relationship
  const messageFactor = Math.min(totalMessages * 0.3, 30)
  const conversationFactor = Math.min(totalConversations * 3, 30)
  const memoryFactor = Math.min(memoryCount * 2, 25)
  const baseFactor = Math.min(currentDepth, 15) // preserve existing depth

  return Math.min(100, Math.round(messageFactor + conversationFactor + memoryFactor + baseFactor))
}

// ── Episodic summary generator prompt ──

export const EPISODIC_SUMMARY_PROMPT = `Buat ringkasan SANGAT SINGKAT (1-2 kalimat) dari percakapan berikut. Fokus pada:
- Topik utama yang dibahas
- Informasi penting tentang user
- Keputusan atau kesimpulan yang dibuat

Format: kalimat natural, bukan poin-poin.
Contoh: "User bertanya tentang cara membuat kopi manual brew dan meminta rekomendasi biji kopi dari Toraja."

HANYA output ringkasan, tanpa penjelasan tambahan.`
