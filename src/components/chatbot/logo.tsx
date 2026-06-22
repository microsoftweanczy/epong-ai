'use client'

import Image from 'next/image'

interface LogoProps {
  size?: number
  className?: string
}

/** The ManggarAI app logo — rendered as a rounded-square image. */
export function Logo({ size = 44, className = '' }: LogoProps) {
  // Always use 256px source for maximum sharpness at any display size
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
