// Appelé chaque jour par le cron Vercel (voir vercel.json) pour garder
// le projet Supabase actif : l'offre gratuite le met en pause après ~7 jours sans requête.
export default async function handler(req, res) {
  // Si CRON_SECRET est défini sur Vercel, seul le cron peut appeler cette route.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    return res.status(500).json({ ok: false, error: 'Variables Supabase manquantes' })
  }

  // Vraie requête SQL sur la base (RLS renvoie [] sans utilisateur connecté,
  // mais Postgres est bien sollicité, ce qui compte comme activité).
  const r = await fetch(`${url}/rest/v1/meals?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })

  return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() })
}
