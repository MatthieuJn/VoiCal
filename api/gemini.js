// Proxy serveur vers Gemini : la clé GEMINI_API_KEY reste sur Vercel
// et n'est jamais envoyée au navigateur.
const MODEL = 'gemini-2.5-flash'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' })

  const geminiKey = process.env.GEMINI_API_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY
  if (!geminiKey || !supabaseUrl || !supabaseAnon) {
    return res.status(500).json({ error: 'Configuration serveur incomplète (GEMINI_API_KEY ?)' })
  }

  // 1. Seul un utilisateur connecté à l'app peut utiliser Gemini.
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token) return res.status(401).json({ error: 'Non connecté' })
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnon, Authorization: `Bearer ${token}` },
  })
  if (!userRes.ok) return res.status(401).json({ error: 'Session invalide, reconnecte-toi' })

  // 2. Appel à Gemini avec la clé secrète.
  const { contents } = req.body || {}
  if (!contents) return res.status(400).json({ error: 'Requête vide' })

  const gRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({ contents }),
    },
  )
  const data = await gRes.json()

  if (!gRes.ok) {
    const msg = gRes.status === 402
      ? 'Crédit Gemini épuisé : recharge-le sur ai.studio'
      : data?.error?.message || `Erreur Gemini (${gRes.status})`
    return res.status(gRes.status).json({ error: msg })
  }

  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')
  return res.status(200).json({ text })
}
