'use client'

import { useState } from 'react'
import { MessageCircle, Search, MoreVertical, Plus, LogOut, Check, CheckCheck } from 'lucide-react'
import { Avatar } from './avatar'
import type { ConversationSummary } from '@/lib/chat-types'
import { formatListTime } from '@/lib/format'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from '@/lib/session-store'

interface ChatListProps {
  conversations: ConversationSummary[]
  onlineUserIds: string[]
  loading: boolean
  onSelect: (id: string) => void
  onNewChat: () => void
}

export function ChatList({
  conversations,
  onlineUserIds,
  loading,
  onSelect,
  onNewChat,
}: ChatListProps) {
  const [filter, setFilter] = useState('')
  const clear = useSession((s) => s.clear)
  const currentUserId = useSession((s) => s.user?.id)

  const filtered = filter.trim()
    ? conversations.filter((c) =>
        (c.name || '').toLowerCase().includes(filter.toLowerCase())
      )
    : conversations

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      {/* Header */}
      <header className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">FamilyChat</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            className="rounded-full p-2 hover:bg-white/10"
            aria-label="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="More options"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  clear()
                }}
                className="text-red-600 focus:text-red-700"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Switch user
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white px-3 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-full bg-[#f0f2f5] pl-9 pr-4 text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400">
            Loading chats…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/15">
              <MessageCircle className="h-8 w-8 text-[#25D366]" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              No chats yet
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Tap the <Plus className="inline h-3 w-3" /> button to start a new
              chat with a family member.
            </p>
            <button
              onClick={onNewChat}
              className="mt-5 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1fb958]"
            >
              New chat
            </button>
          </div>
        )}

        {!loading &&
          filtered.map((c) => {
            const isOnline = c.isGroup
              ? false
              : c.otherUserId
                ? onlineUserIds.includes(c.otherUserId)
                : false
            const last = c.lastMessage
            const lastPreview = last
              ? `${last.senderId === currentUserId ? 'You: ' : (c.isGroup ? last.senderName + ': ' : '')}${last.content}`
              : 'No messages yet'

            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-[#f5f6f6] active:bg-[#e9edef]"
              >
                <Avatar
                  name={c.name || '?'}
                  color={c.avatarColor}
                  isGroup={c.isGroup}
                  online={isOnline}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-gray-900">
                      {c.name || 'Unknown'}
                    </span>
                    <span
                      className={`shrink-0 text-xs ${
                        c.unreadCount > 0
                          ? 'font-semibold text-[#25D366]'
                          : 'text-gray-400'
                      }`}
                    >
                      {last ? formatListTime(last.createdAt) : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-500">
                      {last &&
                        last.senderId === currentUserId && (
                          <span className="shrink-0">
                            {last.status === 'read' ? (
                              <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
                            ) : last.status === 'delivered' ? (
                              <CheckCheck className="h-3.5 w-3.5 text-gray-400" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </span>
                        )}
                      <span className="truncate">{lastPreview}</span>
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] px-1.5 text-xs font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
      </div>
    </div>
  )
}
