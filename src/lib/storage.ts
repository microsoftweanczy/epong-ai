import { supabase } from './supabase'
import { NEW_CHAT_TITLE } from './types'
import type { Conversation, ChatMessage, Role } from './types'

/**
 * Storage abstraction for chat history — user-scoped.
 *
 * Strategy:
 *  - If Supabase env vars are absent  -> LocalStore (always).
 *  - If Supabase env vars are present -> probe once; if the tables exist use
 *    SupabaseStore (filtered by user_id), otherwise LocalStore.
 *
 * All data is scoped to the authenticated user's id.
 */

export interface ChatStore {
  backend: 'supabase' | 'local'
  listConversations(): Promise<Conversation[]>
  createConversation(title?: string): Promise<Conversation>
  getMessages(conversationId: string): Promise<ChatMessage[]>
  addMessage(
    conversationId: string,
    role: Role,
    content: string
  ): Promise<ChatMessage>
  renameConversation(conversationId: string, title: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  touchConversation(conversationId: string): Promise<void>
}

// ---------------------------------------------------------------- Supabase --

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

class SupabaseStore implements ChatStore {
  backend = 'supabase' as const
  constructor(private userId: string) {}

  async listConversations(): Promise<Conversation[]> {
    const { data, error } = await supabase!
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', this.userId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map((r: any) => ({
      id: r.id,
      title: r.title || NEW_CHAT_TITLE,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  async createConversation(title?: string): Promise<Conversation> {
    const now = new Date().toISOString()
    const row = {
      id: uuid(),
      user_id: this.userId,
      title: title?.trim() || NEW_CHAT_TITLE,
      created_at: now,
      updated_at: now,
    }
    const { error } = await supabase!.from('conversations').insert(row)
    if (error) throw error
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase!
      .from('messages')
      .select('id, conversation_id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []).map((r: any) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }))
  }

  async addMessage(
    conversationId: string,
    role: Role,
    content: string
  ): Promise<ChatMessage> {
    const now = new Date().toISOString()
    const row = {
      id: uuid(),
      conversation_id: conversationId,
      role,
      content,
      created_at: now,
    }
    const { error } = await supabase!.from('messages').insert(row)
    if (error) throw error
    return {
      id: row.id,
      conversationId,
      role,
      content,
      createdAt: row.created_at,
    }
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const { error } = await supabase!
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', this.userId)
    if (error) throw error
  }

  async touchConversation(conversationId: string): Promise<void> {
    const { error } = await supabase!
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('user_id', this.userId)
    if (error) throw error
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await supabase!
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', this.userId)
    if (error) throw error
  }
}

// -------------------------------------------------------------- localStorage --

interface LocalDB {
  conversations: Conversation[]
  messages: ChatMessage[]
}

function localKey(userId: string) {
  return `epong-chat-${userId}`
}

function loadLocal(userId: string): LocalDB {
  if (typeof window === 'undefined') return { conversations: [], messages: [] }
  try {
    const raw = localStorage.getItem(localKey(userId))
    if (!raw) return { conversations: [], messages: [] }
    return JSON.parse(raw)
  } catch {
    return { conversations: [], messages: [] }
  }
}

function saveLocal(userId: string, db: LocalDB) {
  if (typeof window === 'undefined') return
  localStorage.setItem(localKey(userId), JSON.stringify(db))
}

class LocalStore implements ChatStore {
  backend = 'local' as const
  constructor(private userId: string) {}

  async listConversations(): Promise<Conversation[]> {
    const db = loadLocal(this.userId)
    return [...db.conversations].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  }

  async createConversation(title?: string): Promise<Conversation> {
    const db = loadLocal(this.userId)
    const now = new Date().toISOString()
    const conv: Conversation = {
      id: uuid(),
      title: title?.trim() || NEW_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
    }
    db.conversations.push(conv)
    saveLocal(this.userId, db)
    return conv
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const db = loadLocal(this.userId)
    return db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
  }

  async addMessage(
    conversationId: string,
    role: Role,
    content: string
  ): Promise<ChatMessage> {
    const db = loadLocal(this.userId)
    const now = new Date().toISOString()
    const msg: ChatMessage = {
      id: uuid(),
      conversationId,
      role,
      content,
      createdAt: now,
    }
    db.messages.push(msg)
    const conv = db.conversations.find((c) => c.id === conversationId)
    if (conv) conv.updatedAt = now
    saveLocal(this.userId, db)
    return msg
  }

  async renameConversation(conversationId: string, title: string): Promise<void> {
    const db = loadLocal(this.userId)
    const conv = db.conversations.find((c) => c.id === conversationId)
    if (conv) {
      conv.title = title
      conv.updatedAt = new Date().toISOString()
      saveLocal(this.userId, db)
    }
  }

  async touchConversation(conversationId: string): Promise<void> {
    const db = loadLocal(this.userId)
    const conv = db.conversations.find((c) => c.id === conversationId)
    if (conv) {
      conv.updatedAt = new Date().toISOString()
      saveLocal(this.userId, db)
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const db = loadLocal(this.userId)
    db.conversations = db.conversations.filter((c) => c.id !== conversationId)
    db.messages = db.messages.filter((m) => m.conversationId !== conversationId)
    saveLocal(this.userId, db)
  }
}

// ------------------------------------------------------ resilient probe wrapper

class ResilientStore implements ChatStore {
  private resolved: ChatStore | null = null
  private resolving: Promise<ChatStore> | null = null
  public backend: 'supabase' | 'local' = 'local'

  constructor(private userId: string) {}

  private async resolve(): Promise<ChatStore> {
    if (this.resolved) return this.resolved
    if (this.resolving) return this.resolving

    this.resolving = (async () => {
      // Guest users always use local storage (no Supabase auth session)
      if (this.userId.startsWith('guest-')) {
        this.backend = 'local'
        this.resolved = new LocalStore(this.userId)
        return this.resolved
      }
      if (!supabase) {
        this.backend = 'local'
        this.resolved = new LocalStore(this.userId)
        return this.resolved
      }
      try {
        const { error } = await supabase
          .from('conversations')
          .select('id')
          .limit(1)
        if (error) throw error
        this.backend = 'supabase'
        this.resolved = new SupabaseStore(this.userId)
        return this.resolved
      } catch (e: any) {
        console.warn(
          '[storage] Supabase not ready, using local fallback:',
          e?.message
        )
        this.backend = 'local'
        this.resolved = new LocalStore(this.userId)
        return this.resolved
      }
    })()

    return this.resolving
  }

  async listConversations() {
    return (await this.resolve()).listConversations()
  }
  async createConversation(title?: string) {
    return (await this.resolve()).createConversation(title)
  }
  async getMessages(conversationId: string) {
    return (await this.resolve()).getMessages(conversationId)
  }
  async addMessage(conversationId: string, role: Role, content: string) {
    return (await this.resolve()).addMessage(conversationId, role, content)
  }
  async renameConversation(conversationId: string, title: string) {
    return (await this.resolve()).renameConversation(conversationId, title)
  }
  async deleteConversation(conversationId: string) {
    return (await this.resolve()).deleteConversation(conversationId)
  }
  async touchConversation(conversationId: string) {
    return (await this.resolve()).touchConversation(conversationId)
  }
}

// ----------------------------------------------------------------- factory --

// cache stores per userId
const storeCache = new Map<string, ResilientStore>()

export function getStore(userId: string): ChatStore {
  let s = storeCache.get(userId)
  if (!s) {
    s = new ResilientStore(userId)
    storeCache.set(userId, s)
  }
  return s
}
