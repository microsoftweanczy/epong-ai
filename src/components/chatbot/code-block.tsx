'use client'

import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

/**
 * Code block with a copy button.
 * Used as a custom `pre` renderer in ReactMarkdown.
 */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)

  // Extract text content from the children (the <code> element)
  const getText = (): string => {
    if (typeof children === 'string') return children
    if (Array.isArray(children)) {
      return children
        .map((c) => {
          if (typeof c === 'string') return c
          if (c && typeof c === 'object' && 'props' in (c as any)) {
            const props = (c as any).props
            if (props?.children) {
              if (typeof props.children === 'string') return props.children
              if (Array.isArray(props.children)) return props.children.join('')
            }
          }
          return ''
        })
        .join('')
    }
    if (children && typeof children === 'object' && 'props' in (children as any)) {
      const props = (children as any).props
      if (typeof props?.children === 'string') return props.children
      if (Array.isArray(props?.children)) return props.children.join('')
    }
    return ''
  }

  const handleCopy = async () => {
    const text = getText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="group/code relative">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-slate-700/80 text-slate-200 opacity-0 backdrop-blur transition hover:bg-slate-600 group-hover/code:opacity-100"
        aria-label="Salin kode"
        title="Salin kode"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <pre>{children}</pre>
    </div>
  )
}
