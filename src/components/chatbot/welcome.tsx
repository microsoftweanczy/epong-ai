'use client'

import { Logo } from './logo'

const SUGGESTIONS = [
  {
    title: 'Plan my day',
    subtitle: 'Help me structure a productive morning',
    prompt:
      'Help me plan a productive day. I usually wake up at 7am — suggest a balanced schedule with focus blocks, breaks, and exercise.',
  },
  {
    title: 'Explain a concept',
    subtitle: 'Make quantum computing simple',
    prompt:
      'Explain quantum computing to me like I am a curious beginner. Use a simple analogy and keep it under 150 words.',
  },
  {
    title: 'Write something',
    subtitle: 'Draft a kind message to a friend',
    prompt:
      'Help me write a warm, short message to check in on a friend I have not spoken to in a while.',
  },
  {
    title: 'Brainstorm ideas',
    subtitle: 'Weekend project ideas',
    prompt:
      'Give me 5 fun, achievable weekend project ideas I can build with basic coding skills. Briefly describe each.',
  },
]

interface Props {
  onPick: (prompt: string) => void
}

export function Welcome({ onPick }: Props) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="mb-5 shadow-lg shadow-indigo-500/30">
        <Logo size={72} />
      </div>
      <h1 className="text-[28px] font-semibold tracking-tight text-slate-800">
        How can I help?
      </h1>
      <p className="mt-2 max-w-sm text-center text-[15px] text-slate-500">
        Ask me anything — I can plan, write, explain, brainstorm, and more.
      </p>

      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            onClick={() => onPick(s.prompt)}
            className="tap-feedback glass flex flex-col items-start rounded-3xl px-5 py-4 text-left hover:brightness-105"
          >
            <span className="text-[15px] font-semibold text-slate-800">
              {s.title}
            </span>
            <span className="mt-0.5 text-[13px] text-slate-500">
              {s.subtitle}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
