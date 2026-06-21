// Shared types for the personal AI chatbot

export type Role = 'user' | 'assistant' | 'system'

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
}

// Message shape sent to the GLM API
export interface ApiMessage {
  role: Role
  content: string
}
