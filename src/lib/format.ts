import { format, isToday, isYesterday, isThisYear } from 'date-fns'

/**
 * Format a timestamp for display in chat lists and message bubbles.
 * - Today → HH:mm
 * - Yesterday → "Yesterday"
 * - This year → dd/MM
 * - Older → dd/MM/yyyy
 */
export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return 'Yesterday'
  if (isThisYear(d)) return format(d, 'dd/MM')
  return format(d, 'dd/MM/yyyy')
}
