'use client'

import { useState } from 'react'
import { MessageSquare, Trash2, X, Pencil, Check, Settings, LogOut, Search } from 'lucide-react'
import type { Conversation } from '@/lib/types'
import { formatTime } from '@/lib/format'
import { Logo } from './logo'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  open: boolean
  collapsed?: boolean
  userName?: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSettings: () => void
  onSignOut: () => void
}

export function Sidebar({
  conversations,
  activeId,
  open,
  collapsed = false,
  userName,
  onClose,
  onSelect,
  onDelete,
  onRename,
  onSettings,
  onSignOut,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredConversations = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations

  const startEdit = (c: Conversation) => {
    setEditingId(c.id)
    setEditValue(c.title)
  }
  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-sm sm:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[80%] max-w-[320px] flex-col transition-transform duration-300 ease-out sm:static sm:z-0 sm:shrink-0 sm:w-72 sm:max-w-none sm:translate-x-0 sm:transition-[width,transform,opacity] lg:w-80 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'sm:!w-0 sm:!opacity-0 sm:!overflow-hidden' : 'sm:opacity-100'}`
      }
      >
        <div className="safe-top glass flex h-full flex-col sm:rounded-none sm:border-r sm:border-slate-200/60 dark:sm:border-slate-800/60">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <Logo size={44} />
              <span className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 sm:text-[19px] dark:text-white">
                ManggarAI
              </span>
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-900/5 sm:hidden"
              aria-label="Tutup sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search bar — filter conversations by title */}
          <div className="px-2.5 pb-2 sm:px-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari obrolan..."
                className="w-full rounded-xl border border-slate-200 bg-white/60 py-1.5 pl-8 pr-2 text-[12px] text-slate-700 outline-none transition focus:border-[#0A84FF]/40 focus:bg-white dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-200"
              />
            </div>
          </div>

          {/* List */}
          <div className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-2 sm:px-2">
            {conversations.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                Belum ada obrolan.
                <br />
                Mulai obrolan baru untuk memulai.
              </div>
            )}
            {conversations.length > 0 && filteredConversations.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                Tidak ada obrolan cocok dengan "{searchQuery}".
              </div>
            )}
            {filteredConversations.map((c) => {
              const isActive = c.id === activeId
              const isEditing = editingId === c.id
              return (
                <div
                  key={c.id}
                  className={`group relative mb-0.5 flex items-center gap-2 rounded-xl px-2.5 py-2.5 transition sm:rounded-2xl sm:px-3 ${
                    isActive
                      ? 'bg-white/70 shadow-sm'
                      : 'hover:bg-white/40'
                  }`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="min-w-0 flex-1 rounded-md bg-white/80 px-1.5 py-0.5 text-sm outline-none ring-1 ring-[#0A84FF]"
                    />
                  ) : (
                    <button
                      onClick={() => onSelect(c.id)}
                      className="flex min-w-0 flex-1 flex-col text-left"
                    >
                      <span className="truncate text-[13px] font-medium text-slate-700 sm:text-[14px]">
                        {c.title}
                      </span>
                      <span className="text-[10px] text-slate-400 sm:text-[11px]">
                        {formatTime(c.updatedAt)}
                      </span>
                    </button>
                  )}
                  {!isEditing && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                      <button
                        onClick={() => startEdit(c)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-900/10 hover:text-slate-600 dark:hover:bg-white/10"
                        aria-label="Ganti nama"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Hapus obrolan "${c.title}"?`)) {
                            onDelete(c.id)
                          }
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-500/15 hover:text-red-500"
                        aria-label="Hapus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {isEditing && (
                    <button
                      onClick={commitEdit}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-500 hover:bg-emerald-500/15"
                      aria-label="Simpan"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-white/40 px-2.5 py-2 sm:px-3 sm:py-2.5">
            <button
              onClick={onSettings}
              className="tap-feedback mb-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Settings className="h-5 w-5" />
              <span className="text-[14px] font-medium sm:text-[15px]">Pengaturan</span>
            </button>
            <button
              onClick={onSignOut}
              className="tap-feedback flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-[14px] font-medium sm:text-[15px]">Keluar</span>
              {userName && (
                <span className="ml-auto max-w-[80px] truncate text-[11px] text-slate-400 sm:max-w-[100px] sm:text-[12px]">
                  {userName}
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
