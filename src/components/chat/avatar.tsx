'use client'

import { initials } from '@/lib/format'

interface AvatarProps {
  name: string
  color?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  online?: boolean
  isGroup?: boolean
  className?: string
}

const sizeMap = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-11 w-11 text-base',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

export function Avatar({
  name,
  color = '#2563EB',
  size = 'md',
  online,
  isGroup,
  className = '',
}: AvatarProps) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      <div
        className={`flex items-center justify-center rounded-full font-semibold text-white ${sizeMap[size]}`}
        style={{ backgroundColor: color }}
      >
        {isGroup ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-1/2 w-1/2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ) : (
          <span>{initials(name)}</span>
        )}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-white bg-[#25D366]" />
      )}
    </div>
  )
}
