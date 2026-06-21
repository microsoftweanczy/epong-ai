'use client'

import Image from 'next/image'

interface LogoProps {
  size?: number
  className?: string
}

/** The Epong AI app logo — rendered as a rounded-square image. */
export function Logo({ size = 32, className = '' }: LogoProps) {
  return (
    <Image
      src="/icons/logo-64.png"
      alt="Epong AI"
      width={size}
      height={size}
      className={`rounded-[28%] object-cover ${className}`}
      priority
    />
  )
}
