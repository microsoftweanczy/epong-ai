'use client'

import { useState } from 'react'
import { Plus, MessageSquare, Trash2, X, Pencil, Check, Settings, LogOut } from 'lucide-react'
import type { Conversation } from '@/lib/types'
import { formatTime } from '@/lib/format'
import { Logo } from './logo'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  open: boolean
  userName?: string | null
  onClose: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onSettings: () => void
  onSignOut: () => void
}

export function Sidebar({
  conversations,
  activeId,
  open,
  userName,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onSettings,
  onSignOut,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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
        className={`fixed inset-y-0 left-0 z-40 flex w-[84%] max-w-xs flex-col transition-transform duration-300 ease-out sm:static sm:z-0 sm:w-72 sm:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="safe-top safe-x glass m-2 flex h-[calc(100dvh-1rem)] flex-col rounded-[28px] sm:m-3 sm:h-[calc(100dvh-1.5rem)]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <div className="flex items-center gap-2.5">
              <Logo size={34} />
              <span className="text-[18px] font-semibold tracking-[-0.02em] text-slate-800 dark:text-slate-100">
                Epong AI
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

          {/* New chat */}
          <div className="px-3 pb-2">
            <button
              onClick={onNew}
              className="tap-feedback flex w-full items-center gap-2 rounded-2xl bg-gradient-to-br from-[#0A84FF] to-[#0064D6] px-4 py-2.5 text-[15px] font-medium text-white shadow-md shadow-[#0A84FF]/25 hover:brightness-110"
            >
              <Plus className="h-5 w-5" />
              Obrolan Baru
            </button>
          </div>

          {/* List */}
          <div className="thin-scrollbar flex-1 overflow-y-auto px-2 pb-2">
            {conversations.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                Belum ada obrolan.
                <br />
                Mulai obrolan baru untuk memulai.
              </div>
            )}
            {conversations.map((c) => {
              const isActive = c.id === activeId
              const isEditing = editingId === c.id
              return (
                <div
                  key={c.id}
                  className={`group relative mb-0.5 flex items-center gap-2 rounded-2xl px-3 py-2.5 transition ${
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
                      className="min-w-0 flex-1 rounded-md bg-white/80 px-1.5 py-0.5 text-sm outline-none ring-1 ring-indigo-300"
                    />
                  ) : (
                    <button
                      onClick={() => onSelect(c.id)}
                      className="flex min-w-0 flex-1 flex-col text-left"
                    >
                      <span className="truncate text-[14px] font-medium text-slate-700">
                        {c.title}
                      </span>
                      <span className="text-[11px] text-slate-400">
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
          <div className="border-t border-white/40 px-3 py-2.5">
            <button
              onClick={onSettings}
              className="tap-feedback mb-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Settings className="h-5 w-5" />
              <span className="text-[15px] font-medium">Pengaturan</span>
            </button>
            <button
              onClick={onSignOut}
              className="tap-feedback flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-[15px] font-medium">Keluar</span>
              {userName && (
                <span className="ml-auto truncate text-[12px] text-slate-400">
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
