// Shared types & constants for the personal AI chatbot

export type Role = 'user' | 'assistant' | 'system'

export interface Attachment {
  id: string
  type: 'image' | 'video' | 'file'
  name: string
  mimeType: string
  /** base64 data URL for images/videos, or empty for text files */
  dataUrl: string
  /** for text files: extracted text content */
  textContent?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: Role
  content: string
  createdAt: string
  attachments?: Attachment[]
}

// Message shape sent to the AI providers
export interface ApiMessage {
  role: Role
  content: string
}

// Default title for new/untitled conversations
export const NEW_CHAT_TITLE = 'Obrolan Baru'

// Max length of an auto-generated conversation title (from first user message)
export const TITLE_MAX_LENGTH = 42

