import { format, isToday, isYesterday, isThisYear } from 'date-fns'

// Time shown in the chat list / message bubble, WhatsApp-style.
export function formatChatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  if (isThisYear(d)) return format(d, 'dd/MM')
  return format(d, 'dd/MM/yyyy')
}

// Time shown in the conversation list (compact).
export function formatListTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  if (isThisYear(d)) return format(d, 'dd/MM')
  return format(d, 'dd/MM/yyyy')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
