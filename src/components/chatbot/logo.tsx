'use client'

import Image from 'next/image'

interface LogoProps {
  size?: number
  className?: string
}

/** The ManggarAI app logo — rendered as a rounded-square image. */
export function Logo({ size = 40, className = '' }: LogoProps) {
  // Use the 128px source for crisp rendering at any size
  const src = size <= 48 ? '/icons/logo-64.png' : '/icons/logo-128.png'
  return (
    <Image
      src={src}
      alt="ManggarAI"
      width={size}
      height={size}
      className={`rounded-[22%] object-cover ${className}`}
      priority
      unoptimized
    />
  )
}
