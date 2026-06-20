import type { Preferences, MemoryNote } from './settings'

/**
 * Context-aware quote library.
 * Quotes are tagged by theme + language. The selector analyzes the user's
 * memory, behavior profile, and preferences to pick a fitting quote.
 */

export interface Quote {
  text: string
  lang: 'id' | 'en'
  category: QuoteCategory
}

export type QuoteCategory =
  | 'motivasi' // motivation / ambition
  | 'tenang' // calm / stress relief
  | 'bijak' // general wisdom
  | 'humor' // light humor
  | 'kreativitas' // creativity
  | 'syukur' // gratitude / reflection
  | 'pertumbuhan' // personal growth
  | 'keberanian' // courage

const QUOTES: Quote[] = [
  // ── motivasi (ID) ──
  { text: 'Langkah kecil hari ini adalah lompatan besar esok hari.', lang: 'id', category: 'motivasi' },
  { text: 'Kerja keras mengalahkan bakat saat bakat tidak bekerja keras.', lang: 'id', category: 'motivasi' },
  { text: 'Fokus pada progress, bukan kesempurnaan.', lang: 'id', category: 'motivasi' },
  { text: 'Disiplin adalah jembatan antara tujuan dan pencapaian.', lang: 'id', category: 'motivasi' },
  { text: 'Hari yang tidak kamu mulai dengan niat, akan menguasaimu.', lang: 'id', category: 'motivasi' },
  { text: 'Kamu lebih kuat dari alasan yang kamu buat untuk menyerah.', lang: 'id', category: 'motivasi' },
  { text: 'Setiap ahli pernah jadi pemula yang tidak menyerah.', lang: 'id', category: 'motivasi' },
  { text: 'Hasil tidak pernah mengkhianati usaha yang jujur.', lang: 'id', category: 'motivasi' },
  { text: 'Jangan bandingkan awalmu dengan hasil orang lain.', lang: 'id', category: 'motivasi' },
  // ── motivasi (EN) ──
  { text: 'The secret of getting ahead is getting started.', lang: 'en', category: 'motivasi' },
  { text: 'Small steps every day add up to big results.', lang: 'en', category: 'motivasi' },
  { text: 'Discipline is the bridge between goals and accomplishment.', lang: 'en', category: 'motivasi' },
  { text: 'Don\'t watch the clock; do what it does — keep going.', lang: 'en', category: 'motivasi' },
  { text: 'Your only limit is the one you set in your mind.', lang: 'en', category: 'motivasi' },
  { text: 'The expert in anything was once a beginner who refused to give up.', lang: 'en', category: 'motivasi' },
  { text: 'Don\'t compare your beginning to someone else\'s middle.', lang: 'en', category: 'motivasi' },
  { text: 'Push yourself, because no one else is going to do it for you.', lang: 'en', category: 'motivasi' },

  // ── tenang (ID) ──
  { text: 'Tarik napas. Dunia tidak akan runtuh hanya karena hari ini berat.', lang: 'id', category: 'tenang' },
  { text: 'Tenang bukan berarti menyerah, tapi memilih damai di tengah riuh.', lang: 'id', category: 'tenang' },
  { text: 'Tidak semua harus diselesaikan hari ini. Istirahat juga produktif.', lang: 'id', category: 'tenang' },
  { text: 'Badai selalu berlalu. Yang tersisa adalah kamu yang lebih kuat.', lang: 'id', category: 'tenang' },
  { text: 'Pelankan langkah. Hidup bukan lomba, perjalanan.', lang: 'id', category: 'tenang' },
  // ── tenang (EN) ──
  { text: 'Within you there is a stillness and a sanctuary to which you can retreat.', lang: 'en', category: 'tenang' },
  { text: 'Breathe. Let go. Remind yourself that this very moment is the only one you know you have for sure.', lang: 'en', category: 'tenang' },
  { text: 'Sometimes the most productive thing you can do is rest.', lang: 'en', category: 'tenang' },
  { text: 'Peace begins with a single breath.', lang: 'en', category: 'tenang' },
  { text: 'Calm mind brings inner strength and self-confidence.', lang: 'en', category: 'tenang' },

  // ── bijak (ID) ──
  { text: 'Yang kita takutkan jarang seburuk yang kita bayangkan.', lang: 'id', category: 'bijak' },
  { text: 'Waktu tidak bisa dibeli, tapi bisa dihargai.', lang: 'id', category: 'bijak' },
  { text: 'Mendengar adalah setengah dari memahami.', lang: 'id', category: 'bijak' },
  { text: 'Kebahagiaan bukan tujuan, melainkan cara menjalani.', lang: 'id', category: 'bijak' },
  { text: 'Yang sulit dan yang benar sering kali jalan yang sama.', lang: 'id', category: 'bijak' },
  // ── bijak (EN) ──
  { text: 'We suffer more often in imagination than in reality.', lang: 'en', category: 'bijak' },
  { text: 'The only true wisdom is in knowing you know nothing.', lang: 'en', category: 'bijak' },
  { text: 'Happiness is not something ready made; it comes from your own actions.', lang: 'en', category: 'bijak' },
  { text: 'Knowing yourself is the beginning of all wisdom.', lang: 'en', category: 'bijak' },
  { text: 'The journey of a thousand miles begins with a single step.', lang: 'en', category: 'bijak' },

  // ── humor (ID) ──
  { text: 'Kopi pertama tidak dihitung sebagai pagi. Itu cuma survival.', lang: 'id', category: 'humor' },
  { text: 'Saya bukan malas, saya sedang mode hemat energi.', lang: 'id', category: 'humor' },
  { text: 'Kalau hidup memberimu lemon, minta juga gula dan es batu.', lang: 'id', category: 'humor' },
  { text: 'WiFi lemot lebih membuat stres daripada masalah hidup.', lang: 'id', category: 'humor' },
  // ── humor (EN) ──
  { text: 'I\'m not lazy, I\'m on energy-saving mode.', lang: 'en', category: 'humor' },
  { text: 'Behind every great person is a substantial amount of coffee.', lang: 'en', category: 'humor' },
  { text: 'If life gives you lemons, ask for tequila and salt.', lang: 'en', category: 'humor' },
  { text: 'Common sense is like deodorant — the people who need it most never use it.', lang: 'en', category: 'humor' },

  // ── kreativitas (ID) ──
  { text: 'Kreativitas adalah keberanian untuk membuat kesalahan yang baru.', lang: 'id', category: 'kreativitas' },
  { text: 'Ide terbaik datang saat kamu berhenti memaksanya.', lang: 'id', category: 'kreativitas' },
  { text: 'Setiap karya besar lahir dari keberanian mencoba.', lang: 'id', category: 'kreativitas' },
  { text: 'Keindahan ada di detail yang sabar dikerjakan.', lang: 'id', category: 'kreativitas' },
  // ── kreativitas (EN) ──
  { text: 'Creativity is intelligence having fun.', lang: 'en', category: 'kreativitas' },
  { text: 'Every artist was first an amateur.', lang: 'en', category: 'kreativitas' },
  { text: 'The chief enemy of creativity is good sense.', lang: 'en', category: 'kreativitas' },
  { text: 'Imagination is more important than knowledge.', lang: 'en', category: 'kreativitas' },

  // ── syukur (ID) ──
  { text: 'Bersyukur bukan karena semua baik, tapi melihat kebaikan di semuanya.', lang: 'id', category: 'syukur' },
  { text: 'Yang kamu punya sekarang, dulu adalah yang kamu harapkan.', lang: 'id', category: 'syukur' },
  { text: 'Syukur mengubah apa yang ada menjadi cukup.', lang: 'id', category: 'syukur' },
  { text: 'Hari ini adalah hadiah. Itu sebabnya disebut present.', lang: 'id', category: 'syukur' },
  // ── syukur (EN) ──
  { text: 'Gratitude turns what we have into enough.', lang: 'en', category: 'syukur' },
  { text: 'Enjoy the little things, for one day you may look back and realize they were the big things.', lang: 'en', category: 'syukur' },
  { text: 'Acknowledging the good that you already have is the basis for all abundance.', lang: 'en', category: 'syukur' },
  { text: 'Gratitude is the fairest blossom which springs from the soul.', lang: 'en', category: 'syukur' },

  // ── pertumbuhan (ID) ──
  { text: 'Kegagalan adalah data, bukan identitas.', lang: 'id', category: 'pertumbuhan' },
  { text: 'Versi terbaikmu lahir dari rasa tidak nyaman.', lang: 'id', category: 'pertumbuhan' },
  { text: 'Belajar dari kemarin, hidup untuk hari ini, harap untuk esok.', lang: 'id', category: 'pertumbuhan' },
  { text: 'Kamu tidak perlu hebat untuk mulai, tapi harus mulai untuk jadi hebat.', lang: 'id', category: 'pertumbuhan' },
  // ── pertumbuhan (EN) ──
  { text: 'Failure is simply the opportunity to begin again, this time more intelligently.', lang: 'en', category: 'pertumbuhan' },
  { text: 'The man who moves a mountain begins by carrying away small stones.', lang: 'en', category: 'pertumbuhan' },
  { text: 'What we fear of doing most is usually what we most need to do.', lang: 'en', category: 'pertumbuhan' },
  { text: 'Growth and comfort do not coexist.', lang: 'en', category: 'pertumbuhan' },

  // ── keberanian (ID) ──
  { text: 'Keberanian bukan tanpa takut, tapi melangkah meski takut.', lang: 'id', category: 'keberanian' },
  { text: 'Lebih baik gagal mencoba daripada penasaran seumur hidup.', lang: 'id', category: 'keberanian' },
  { text: 'Kapal memang aman di pelabuhan, tapi bukan untuk itu kapal dibuat.', lang: 'id', category: 'keberanian' },
  { text: 'Keberanianmu hari ini menentukan ceritamu esok hari.', lang: 'id', category: 'keberanian' },
  { text: 'Takut gagal lebih berbahaya daripada gagal itu sendiri.', lang: 'id', category: 'keberanian' },
  { text: 'Ambil risiko. Jika menang, kau bahagia. Jika kalah, kau jadi bijak.', lang: 'id', category: 'keberanian' },
  // ── keberanian (EN) ──
  { text: 'Courage is not the absence of fear, but action in spite of it.', lang: 'en', category: 'keberanian' },
  { text: 'A ship in harbor is safe, but that is not what ships are built for.', lang: 'en', category: 'keberanian' },
  { text: 'Do one thing every day that scares you.', lang: 'en', category: 'keberanian' },
  { text: 'Life begins at the end of your comfort zone.', lang: 'en', category: 'keberanian' },
  { text: 'It always seems impossible until it\'s done.', lang: 'en', category: 'keberanian' },
  { text: 'Be brave enough to be bad at something new.', lang: 'en', category: 'keberanian' },
]

// ── keyword → category mapping (Indonesian + English keywords) ──
const KEYWORD_MAP: { keywords: string[]; category: QuoteCategory }[] = [
  // stress / overwhelmed → calming
  {
    keywords: ['stres', 'cemas', 'lelah', 'capek', 'capai', 'burnout', 'overwhelm', 'tekanan', 'beban', 'sedih', 'galau', 'susah', 'pusing', 'panik', 'khawatir', 'stress', 'tired', 'anxious', 'overwhelmed', 'sad', 'worried'],
    category: 'tenang',
  },
  // goals / ambition / work → motivation
  {
    keywords: ['tujuan', 'target', 'kerja', 'bisnis', 'karir', 'ambisi', 'sukses', 'prestasi', 'mimpi', 'cita', 'goal', 'ambition', 'career', 'success', 'dream', 'startup', 'project', 'proyek', 'deadline'],
    category: 'motivasi',
  },
  // creativity / design / art
  {
    keywords: ['desain', 'design', 'kreatif', 'creative', 'seni', 'art', 'lukis', 'musik', 'menulis', 'writing', ' fotografi', 'photography', 'ide', 'idea', 'inovasi', 'innovation'],
    category: 'kreativitas',
  },
  // learning / growth / student
  {
    keywords: ['belajar', 'learn', 'kuliah', 'sekolah', 'study', 'student', 'tumbuh', 'growth', 'develop', 'kemampuan', 'skill', 'progress', 'improve', 'latihan', 'practice'],
    category: 'pertumbuhan',
  },
  // fear / doubt / new beginnings
  {
    keywords: ['takut', 'fear', 'ragu', 'doubt', 'baru', 'new', 'mulai', 'start', 'berani', 'courage', 'risiko', 'risk', 'keluar zona', 'comfort zone'],
    category: 'keberanian',
  },
  // gratitude / reflection
  {
    keywords: ['syukur', 'grateful', 'terima kasih', 'berkah', 'blessing', 'refleksi', 'reflect', 'hikmah', 'makna', 'meaning'],
    category: 'syukur',
  },
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Smart quote selector. Analyzes the user's memory, behavior profile,
 * and preferences to pick a context-fitting quote. Mixes ID/EN randomly.
 */
export function pickQuote(
  memory: MemoryNote[] | null,
  behaviorProfile: string | null,
  prefs: Preferences | null
): Quote {
  // 1. Gather all user context text
  const memoryText = (memory || []).map((m) => m.content.toLowerCase()).join(' ')
  const profileText = (behaviorProfile || '').toLowerCase()
  const context = `${memoryText} ${profileText}`

  // 2. Score each category by keyword matches in user context
  const scores: Partial<Record<QuoteCategory, number>> = {}
  for (const { keywords, category } of KEYWORD_MAP) {
    let score = 0
    for (const kw of keywords) {
      if (context.includes(kw)) score += 1
    }
    if (score > 0) scores[category] = (scores[category] || 0) + score
  }

  // 3. Bias by preferences
  if (prefs) {
    // humor preference → boost humor quotes
    if (prefs.humor === 'sering') scores.humor = (scores.humor || 0) + 2
    else if (prefs.humor === 'sedikit' && Math.random() < 0.25)
      scores.humor = (scores.humor || 0) + 1
    // formal tone → less humor, more bijak
    if (prefs.tone === 'formal' || prefs.tone === 'profesional') {
      scores.bijak = (scores.bijak || 0) + 1
      scores.humor = Math.max(0, (scores.humor || 0) - 1)
    }
    // akrab/santai → more humor
    if (prefs.tone === 'akrab' || prefs.tone === 'santai') {
      scores.humor = (scores.humor || 0) + 0.5
    }
    // language preference: bias quote language to match
  }

  // 4. Find best-matched category (with some randomness for ties)
  const entries = Object.entries(scores) as [QuoteCategory, number][]
  let pool: Quote[]

  if (entries.length > 0) {
    // sort by score desc
    entries.sort((a, b) => b[1] - a[1])
    const topScore = entries[0][1]
    // pick randomly among top-scored categories (within 1 of the top)
    const topCategories = entries
      .filter(([, s]) => s >= topScore - 0.5)
      .map(([c]) => c)
    const chosenCategory = pickRandom(topCategories)
    pool = QUOTES.filter((q) => q.category === chosenCategory)
  } else {
    // no context match → random wisdom/bijak
    pool = QUOTES.filter((q) => q.category === 'bijak')
  }

  // 5. Filter by preferred language if set (but allow mix ~30% of the time)
  const allowMix = Math.random() < 0.3
  if (prefs && !allowMix) {
    const langPool = pool.filter((q) => q.lang === prefs.language)
    if (langPool.length > 0) pool = langPool
  }

  return pickRandom(pool.length > 0 ? pool : QUOTES)
}
