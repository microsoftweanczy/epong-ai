# Aria — Personal AI Chatbot

A beautiful personal AI chatbot with an **iOS 26 "Liquid Glass"** design, powered by **GLM 4.5 Flash**, backed by **Supabase**, and optimized for **Vercel** deployment.

![Aria](https://img.shields.io/badge/AI-GLM%204.5%20Flash-blue) ![Supabase](https://img.shields.io/badge/Backend-Supabase-green) ![Vercel](https://img.shields.io/badge/Deploy-Vercel-black) ![Next.js](https://img.shields.io/badge/Next.js-16-black)

## ✨ Features

- 🧠 **Real AI** — powered by GLM 4.5 Flash with real-time streaming responses
- ☁️ **Cloud sync** — conversations saved to Supabase, accessible from any device
- 📱 **iOS 26 Liquid Glass UI** — frosted glass panels, mesh-gradient background, SF Pro typography
- 💬 **Multi-turn conversations** — the AI remembers context across messages
- 📝 **Markdown rendering** — code blocks, lists, bold, links in replies
- ⏹️ **Stop generation** — abort AI responses mid-stream
- 🔤 **Auto-titled chats** — conversations named from your first message
- ✏️ **Rename & delete** — full conversation management
- 🔒 **Resilient storage** — falls back to localStorage if Supabase isn't configured

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4 + custom Liquid Glass CSS |
| AI Model | GLM 4.5 Flash (Zhipu AI) — free tier |
| Database | Supabase (PostgreSQL) |
| Deployment | Vercel |
| Markdown | react-markdown |

## 🚀 Quick Start

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/aria-chat.git
cd aria-chat
bun install
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

```env
# Supabase (https://supabase.com)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# GLM API (https://open.bigmodel.cn)
GLM_API_KEY=your-glm-api-key
GLM_MODEL=glm-4.5-flash
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```

### 3. Create the Supabase tables

Open your Supabase dashboard → **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql).

### 4. Run locally

```bash
bun run dev
```

Open `http://localhost:3000` 🎉

## 🌐 Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Add the environment variables (same as `.env.local`)
4. Click **Deploy**

You'll get a live URL like `aria-chat.vercel.app`.

### Add to your phone's home screen

Open the URL in Safari → **Share** → **Add to Home Screen** → it launches full-screen like a native app.

## 📁 Project Structure

```
src/
├── app/
│   ├── api/chat/route.ts    # Streaming GLM chat endpoint (SSE)
│   ├── layout.tsx           # iOS metadata, fonts, toaster
│   ├── page.tsx             # Entry → ChatApp
│   └── globals.css          # Liquid Glass utilities, mesh-bg, markdown styles
├── components/chatbot/
│   ├── chat-app.tsx         # Orchestrator: streaming, state, storage
│   ├── sidebar.tsx          # Conversation list (rename/delete)
│   ├── message-list.tsx     # Auto-scrolling message feed
│   ├── message-bubble.tsx   # iOS bubbles + markdown + thinking dots
│   ├── composer.tsx         # Glass input bar with send/stop
│   └── welcome.tsx          # Suggestion chips on empty state
└── lib/
    ├── supabase.ts          # Supabase client (null if unconfigured)
    ├── storage.ts           # Resilient store: Supabase + localStorage fallback
    ├── types.ts             # Shared TypeScript types
    └── format.ts            # Date formatting helpers

supabase/
└── schema.sql               # Run this in Supabase SQL Editor
```

## 🔑 Getting Free API Keys

| Service | Sign up | Free tier |
|---------|---------|-----------|
| **GLM (Zhipu AI)** | [open.bigmodel.cn](https://open.bigmodel.cn) | Free GLM 4.5 Flash quota |
| **Supabase** | [supabase.com](https://supabase.com) | Free project + 500MB database |
| **Vercel** | [vercel.com](https://vercel.com) | Free hobby deployment |

## 📄 License

MIT — free to use, modify, and share.
