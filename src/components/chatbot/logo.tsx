'use client'

import Image from 'next/image'

interface LogoProps {
  size?: number
  variant?: 'icon' | 'full'
  className?: string
}

/**
 * ManggarAI Logo component.
 * - variant='icon': Just the M+AI symbol (for sidebar, favicon, app icon)
 * - variant='full': Horizontal logo with icon + "ManggarAI" text + tagline (for login, welcome)
 */
export function Logo({ size = 44, variant = 'icon', className = '' }: LogoProps) {
  if (variant === 'full') {
    // Full horizontal logo — calculate height from size param
    const height = size || 80
    const width = Math.round(height * (1127 / 360)) // maintain aspect ratio
    return (
      <Image
        src="/icons/logo-full.png"
        alt="ManggarAI"
        width={width}
        height={height}
        className={`object-contain ${className}`}
        priority
        unoptimized
      />
    )
  }

  // Icon only
  return (
    <Image
      src="/icons/logo-256.png"
      alt="ManggarAI"
      width={size}
      height={size}
      className={`rounded-[20%] object-cover ${className}`}
      priority
      unoptimized
    />
  )
}
