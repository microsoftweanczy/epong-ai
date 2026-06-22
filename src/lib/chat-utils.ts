/**
 * Client-side utilities for: search, pin/bookmark, export, templates.
 */

import type { ChatMessage, Conversation } from './types'

// ── Search ──

export interface SearchResult {
  conversationId: string
  conversationTitle: string
  messageId: string
  content: string
  role: string
  createdAt: string
  matchSnippet: string
}

export function searchMessages(
  conversations: Conversation[],
  allMessages: Map<string, ChatMessage[]>,
  query: string
): SearchResult[] {
  const q = query.toLowerCase().trim()
  if (!q) return []

  const results: SearchResult[] = []
  for (const conv of conversations) {
    const msgs = allMessages.get(conv.id) || []
    for (const msg of msgs) {
      const idx = msg.content.toLowerCase().indexOf(q)
      if (idx !== -1) {
        const start = Math.max(0, idx - 30)
        const end = Math.min(msg.content.length, idx + q.length + 30)
        const snippet =
          (start > 0 ? '…' : '') +
          msg.content.slice(start, end) +
          (end < msg.content.length ? '…' : '')
        results.push({
          conversationId: conv.id,
          conversationTitle: conv.title,
          messageId: msg.id,
          content: msg.content,
          role: msg.role,
          createdAt: msg.createdAt,
          matchSnippet: snippet,
        })
      }
    }
  }
  return results.slice(0, 50) // cap results
}

// ── Pin / Bookmark ──

const PINNED_KEY = 'epong-pinned-messages'

export interface PinnedMessage {
  messageId: string
  conversationId: string
  conversationTitle: string
  content: string
  role: string
  pinnedAt: string
}

export function getPinnedMessages(): PinnedMessage[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')
  } catch {
    return []
  }
}

export function togglePinMessage(
  message: ChatMessage,
  conversationId: string,
  conversationTitle: string
): boolean {
  const pinned = getPinnedMessages()
  const existing = pinned.findIndex((p) => p.messageId === message.id)
  if (existing !== -1) {
    pinned.splice(existing, 1)
    localStorage.setItem(PINNED_KEY, JSON.stringify(pinned))
    return false // unpinned
  }
  pinned.unshift({
    messageId: message.id,
    conversationId,
    conversationTitle,
    content: message.content,
    role: message.role,
    pinnedAt: new Date().toISOString(),
  })
  localStorage.setItem(PINNED_KEY, JSON.stringify(pinned))
  return true // pinned
}

export function isPinned(messageId: string): boolean {
  return getPinnedMessages().some((p) => p.messageId === messageId)
}

export function removePinnedMessage(messageId: string) {
  const pinned = getPinnedMessages().filter((p) => p.messageId !== messageId)
  localStorage.setItem(PINNED_KEY, JSON.stringify(pinned))
}

// ── Export ──

export function exportConversationAsMarkdown(
  conversation: Conversation,
  messages: ChatMessage[]
): string {
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `*Diekspor pada ${new Date().toLocaleString('id-ID')}*`,
    '',
    '---',
    '',
  ]
  for (const msg of messages) {
    const time = new Date(msg.createdAt).toLocaleString('id-ID')
    const role = msg.role === 'user' ? '👤 **Anda**' : '🤖 **Epong AI**'
    lines.push(`### ${role} — ${time}`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')
  }
  return lines.join('\n')
}

export function exportConversationAsText(
  conversation: Conversation,
  messages: ChatMessage[]
): string {
  const lines: string[] = [
    `${conversation.title}`,
    `Diekspor: ${new Date().toLocaleString('id-ID')}`,
    '',
  ]
  for (const msg of messages) {
    const time = new Date(msg.createdAt).toLocaleString('id-ID')
    const role = msg.role === 'user' ? 'Anda' : 'Epong AI'
    lines.push(`[${time}] ${role}:`)
    lines.push(msg.content)
    lines.push('')
  }
  return lines.join('\n')
}

export function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      document.body.removeChild(ta)
      return false
    }
  }
}

// ── Conversation Templates ──

export interface PromptTemplate {
  icon: string
  title: string
  prompt: string
  category: string
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { icon: '✉️', title: 'Tulis Email', prompt: 'Bantu saya menulis email untuk ', category: 'Tulisan' },
  { icon: '📝', title: 'Ringkas Artikel', prompt: 'Ringkas artikel berikut: ', category: 'Tulisan' },
  { icon: '🌍', title: 'Terjemahkan', prompt: 'Terjemahkan teks berikut ke bahasa Inggris: ', category: 'Tulisan' },
  { icon: '💡', title: 'Brainstorm Ide', prompt: 'Beri saya 10 ide untuk ', category: 'Kreatif' },
  { icon: '🎨', title: 'Caption Sosmed', prompt: 'Tulis caption Instagram untuk ', category: 'Kreatif' },
  { icon: '📋', title: 'Buat Rencana', prompt: 'Buatkan rencana untuk ', category: 'Produktivitas' },
  { icon: '🔍', title: 'Jelaskan Konsep', prompt: 'Jelaskan konsep ', category: 'Belajar' },
  { icon: '💻', title: 'Bantu Kode', prompt: 'Bantu saya membuat kode untuk ', category: 'Kode' },
  { icon: '🛒', title: 'Bandingkan Produk', prompt: 'Bandingkan ', category: 'Produktivitas' },
  { icon: '🍳', title: 'Resep Masakan', prompt: 'Berikan resep ', category: 'Lainnya' },
]

// ── Content Filter ──

const NSFW_WORDS = [
  'porn', 'xxx', 'nude', 'nsfw', 'sex', 'explicit',
  'gambel', 'judi', 'casino',
]

export function isContentSafe(text: string, strict: boolean): boolean {
  if (!strict) return true
  const lower = text.toLowerCase()
  return !NSFW_WORDS.some((w) => lower.includes(w))
}
