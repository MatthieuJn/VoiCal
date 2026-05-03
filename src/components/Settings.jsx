import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const FIELDS = [
  { key: 'calories', label: 'Calories',  unit: 'kcal' },
  { key: 'proteins', label: 'Protéines', unit: 'g' },
  { key: 'carbs',    label: 'Glucides',  unit: 'g' },
  { key: 'fats',     label: 'Lipides',   unit: 'g' },
  { key: 'fibers',   label: 'Fibres',    unit: 'g' },
]

const DEFAULTS = { calories: 2000, proteins: 150, carbs: 200, fats: 70, fibers: 30 }

export default function Settings({ userId }) {
  const [goals, setGoals] = useState(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (data) setGoals(data) })
  }, [userId])

  async function saveGoals() {
    await supabase.from('user_goals').upsert({ user_id: userId, ...goals }, { onConflict: 'user_id' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="page">
      <h1>Paramètres</h1>
      <h2>Objectifs journaliers</h2>

      {FIELDS.map(({ key, label, unit }) => (
        <div key={key} className="setting-row">
          <label>{label}</label>
          <div className="setting-input-wrap">
            <input
              type="number"
              value={goals[key]}
              onChange={e => setGoals(g => ({ ...g, [key]: parseInt(e.target.value) || 0 }))}
              className="input input-small"
            />
            <span className="setting-unit">{unit}</span>
          </div>
        </div>
      ))}

      <button className="btn-primary" style={{ marginTop: 24 }} onClick={saveGoals}>
        {saved ? '✓ Sauvegardé' : 'Enregistrer'}
      </button>

      <button className="btn-danger" onClick={logout}>Se déconnecter</button>
    </div>
  )
}
