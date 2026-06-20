// Shared types for FamilyChat

export interface ChatUser {
  id: string
  name: string
  avatarColor: string
  about: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatarColor: string
  content: string
  status: 'sent' | 'delivered' | 'read'
  createdAt: string
}

export interface ConversationSummary {
  id: string
  name: string | null
  isGroup: boolean
  avatarColor: string
  // for direct chats, the "other" participant
  otherUserId: string | null
  // participants (ids + names)
  participants: { id: string; name: string; avatarColor: string }[]
  lastMessage: ChatMessage | null
  unreadCount: number
  updatedAt: string
}
