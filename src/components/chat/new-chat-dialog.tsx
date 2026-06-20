'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Check, Users, X, ArrowLeft } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar } from './avatar'
import type { ChatUser } from '@/lib/chat-types'
import { toast } from 'sonner'

interface NewChatDialogProps {
  open: boolean
  onClose: () => void
  currentUserId: string
  onCreated: (conversationId: string) => void
}

type Mode = 'menu' | 'direct' | 'group'

export function NewChatDialog({
  open,
  onClose,
  currentUserId,
  onCreated,
}: NewChatDialogProps) {
  const [mode, setMode] = useState<Mode>('menu')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ChatUser[]>([])
  const [selected, setSelected] = useState<ChatUser[]>([])
  const [groupName, setGroupName] = useState('')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // reset state when dialog toggles
  useEffect(() => {
    if (open) {
      setMode('menu')
      setQuery('')
      setResults([])
      setSelected([])
      setGroupName('')
    }
  }, [open])

  // search with debounce
  useEffect(() => {
    if (mode === 'menu') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users?search=${encodeURIComponent(query.trim())}&exclude=${currentUserId}`
        )
        const data = await res.json()
        setResults(data.users || [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, mode, currentUserId])

  if (!open) return null

  function toggleSelect(user: ChatUser) {
    setSelected((prev) => {
      const exists = prev.find((u) => u.id === user.id)
      if (exists) return prev.filter((u) => u.id !== user.id)
      return [...prev, user]
    })
  }

  async function startDirect(user: ChatUser) {
    setLoading(true)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          type: 'direct',
          participantIds: [user.id],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed')
      onCreated(data.conversation.id)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start chat')
    } finally {
      setLoading(false)
    }
  }

  async function createGroup() {
    if (selected.length < 1) {
      toast.error('Add at least one family member')
      return
    }
    if (!groupName.trim()) {
      toast.error('Enter a group name')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          type: 'group',
          name: groupName.trim(),
          participantIds: selected.map((u) => u.id),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed')
      onCreated(data.conversation.id)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create group')
    } finally {
      setLoading(false)
    }
  }

  // header title per mode
  const title =
    mode === 'menu'
      ? 'New chat'
      : mode === 'direct'
        ? 'New direct chat'
        : 'New group'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center">
      {/* header */}
      <div className="flex items-center gap-3 bg-[#075E54] px-4 py-4 text-white sm:max-w-md sm:rounded-t-2xl">
        {mode === 'menu' ? (
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setMode('menu')}
            className="rounded-full p-1 hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden bg-white sm:max-w-md sm:rounded-b-2xl sm:border sm:border-t-0">
        {mode === 'menu' && (
          <div className="flex flex-col py-2">
            <button
              onClick={() => setMode('direct')}
              className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#128C7E] text-white">
                <Search className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">New direct chat</div>
                <div className="text-xs text-gray-500">
                  Find a family member by name
                </div>
              </div>
            </button>
            <button
              onClick={() => setMode('group')}
              className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">New group</div>
                <div className="text-xs text-gray-500">
                  Chat with several family members at once
                </div>
              </div>
            </button>
          </div>
        )}

        {mode !== 'menu' && (
          <>
            {mode === 'group' && (
              <div className="border-b px-4 py-3">
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group name (e.g. Smith Family)"
                  className="h-10"
                />
                {selected.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.map((u) => (
                      <span
                        key={u.id}
                        className="flex items-center gap-1 rounded-full bg-[#25D366]/15 px-2 py-1 text-xs font-medium text-[#075E54]"
                      >
                        {u.name}
                        <button
                          onClick={() => toggleSelect(u)}
                          className="rounded-full hover:bg-white/60"
                          aria-label={`Remove ${u.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border-b px-4 py-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search family members by name…"
                  className="h-10 pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {searching && (
                <div className="px-6 py-4 text-sm text-gray-400">Searching…</div>
              )}
              {!searching && query && results.length === 0 && (
                <div className="px-6 py-6 text-center text-sm text-gray-400">
                  No one found. Ask them to join FamilyChat first with this
                  exact name.
                </div>
              )}
              {!searching && !query && (
                <div className="px-6 py-6 text-center text-sm text-gray-400">
                  Type a name to search.
                </div>
              )}
              {results.map((u) => {
                const isSelected = !!selected.find((s) => s.id === u.id)
                return (
                  <button
                    key={u.id}
                    onClick={() =>
                      mode === 'direct' ? startDirect(u) : toggleSelect(u)
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <Avatar name={u.name} color={u.avatarColor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">
                        {u.name}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        {u.about}
                      </div>
                    </div>
                    {mode === 'group' && (
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                          isSelected
                            ? 'border-[#25D366] bg-[#25D366] text-white'
                            : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="h-4 w-4" />}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {mode === 'group' && selected.length > 0 && (
              <div className="border-t p-3">
                <Button
                  onClick={createGroup}
                  disabled={loading || !groupName.trim()}
                  className="h-11 w-full bg-[#25D366] text-white hover:bg-[#1fb958]"
                >
                  {loading
                    ? 'Creating…'
                    : `Create group (${selected.length + 1} members)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
