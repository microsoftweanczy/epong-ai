'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/session-store'
import { toast } from 'sonner'

export function Onboarding() {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const setUser = useSession((s) => s.setUser)

  async function handleStart() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Please enter your name')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed')
      setUser(data.user)
      toast.success(`Welcome, ${data.user.name}!`)
    } catch (e: any) {
      toast.error(e?.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="safe-top safe-bottom flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-[#1E3A8A] to-[#2563EB] px-6 py-10 text-white">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <MessageCircle className="h-12 w-12 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">FamilyChat</h1>
        <p className="mt-2 text-sm text-white/80">
          A private, real-time chat for your family. Free and simple.
        </p>

        <div className="mt-10 space-y-3 rounded-2xl bg-white p-5 text-gray-800 shadow-xl">
          <label className="block text-left text-sm font-medium text-gray-700">
            What should we call you?
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleStart()
            }}
            placeholder="e.g. Mom, Dad, Sarah…"
            autoFocus
            className="h-11"
          />
          <Button
            onClick={handleStart}
            disabled={loading || !name.trim()}
            className="h-12 w-full bg-[#2563EB] text-base font-semibold text-white shadow-lg shadow-[#2563EB]/30 hover:bg-[#1D4ED8]"
          >
            {loading ? 'Starting…' : 'Start Chatting'}
          </Button>
          <p className="pt-1 text-xs text-gray-400">
            Your name is shared so family members can find & message you.
          </p>
        </div>
      </div>
    </div>
  )
}
