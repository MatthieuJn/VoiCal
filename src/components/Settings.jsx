import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'

const GOAL_FIELDS = [
  { key: 'calories', label: 'Maintenance Calorique', unit: 'kcal' },
  { key: 'proteins', label: 'Protéines', unit: 'g' },
  { key: 'carbs',    label: 'Glucides',  unit: 'g' },
  { key: 'fats',     label: 'Lipides',   unit: 'g' },
  { key: 'fibers',   label: 'Fibres',    unit: 'g' },
]

const DEFAULTS = { calories: 2000, proteins: 150, carbs: 200, fats: 70, fibers: 30, birthdate: '', height_cm: '' }

function computeAge(birthdateStr) {
  if (!birthdateStr) return null
  const birth = new Date(birthdateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function shiftDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function Settings({ userId }) {
  const [goals, setGoals] = useState(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [maintEstimate, setMaintEstimate] = useState(null)
  const [maintLoading, setMaintLoading] = useState(false)
  const [maintError, setMaintError] = useState('')
  const [showInfo, setShowInfo] = useState(false)

  useEffect(() => {
    supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGoals({ ...DEFAULTS, ...data })
          if (data.maint_estimate) setMaintEstimate(data.maint_estimate)
        }
      })
  }, [userId])

  async function saveGoals() {
    const { error } = await supabase.from('user_goals').upsert({ user_id: userId, ...goals }, { onConflict: 'user_id' })
    if (error) { console.error('saveGoals error:', error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function recalcMaintenance() {
    const age = computeAge(goals.birthdate)
    const height = parseInt(goals.height_cm)
    if (!age) { setMaintError('Renseigne ta date de naissance d\'abord.'); return }
    if (!height) { setMaintError('Renseigne ta taille d\'abord.'); return }

    setMaintLoading(true)
    setMaintError('')
    try {
      const { data: weights } = await supabase
        .from('weight_logs').select('date,weight').eq('user_id', userId).order('date', { ascending: false }).limit(1)
      const recentWeight = weights?.[0]?.weight
      if (!recentWeight) throw new Error('Renseigne au moins un poids.')

      const bmr = Math.round(10 * recentWeight + 6.25 * height - 5 * age + 5)
      const result = {
        estimated_maintenance: Math.round(bmr * 1.2),
        formula_bmr: bmr,
        formula_sedentary: Math.round(bmr * 1.2),
        formula_estimate: Math.round(bmr * 1.55),
        formula_weight: recentWeight,
      }

      await supabase.from('user_goals').upsert({ user_id: userId, maint_estimate: result }, { onConflict: 'user_id' })
      setMaintEstimate(result)
    } catch (e) {
      setMaintError(e.message || 'Erreur lors du calcul')
    }
    setMaintLoading(false)
  }

  async function loadExportData() {
    const [{ data: meals }, { data: activities }, { data: weights }] = await Promise.all([
      supabase.from('meals').select('date,name,calories,proteins,carbs,fats,fibers').eq('user_id', userId).order('date'),
      supabase.from('activities').select('date,name,type,calories_burned').eq('user_id', userId).order('date'),
      supabase.from('weight_logs').select('date,weight').eq('user_id', userId).order('date'),
    ])
    const byDate = {}
    const allDates = new Set([
      ...(meals || []).map(m => m.date),
      ...(activities || []).map(a => a.date),
      ...(weights || []).map(w => w.date),
    ])
    for (const d of allDates) byDate[d] = { calories: 0, proteins: 0, carbs: 0, fats: 0, fibers: 0, burned: 0, activities: [], weight: null }
    for (const m of (meals || [])) if (byDate[m.date]) {
      byDate[m.date].calories += m.calories || 0
      byDate[m.date].proteins += m.proteins || 0
      byDate[m.date].carbs    += m.carbs    || 0
      byDate[m.date].fats     += m.fats     || 0
      byDate[m.date].fibers   += m.fibers   || 0
    }
    for (const a of (activities || [])) if (byDate[a.date]) {
      byDate[a.date].burned += a.calories_burned || 0
      byDate[a.date].activities.push(a.name)
    }
    for (const w of (weights || [])) if (byDate[w.date]) byDate[w.date].weight = w.weight
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))
  }

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  async function exportCSV() {
    const rows = await loadExportData()
    const age = computeAge(goals.birthdate)
    const meta = [
      `# Profil,Age: ${age ? age + ' ans' : 'non renseigné'},Taille: ${goals.height_cm ? goals.height_cm + ' cm' : 'non renseignée'},Maintenance: ${goals.calories} kcal/j`,
      'Date,Calories (kcal),Protéines (g),Glucides (g),Lipides (g),Fibres (g),Calories brûlées (kcal),Activités,Poids (kg)',
    ]
    const lines = rows.map(r =>
      `${r.date},${r.calories},${Math.round(r.proteins)},${Math.round(r.carbs)},${Math.round(r.fats)},${Math.round(r.fibers)},${r.burned},"${r.activities.join(' + ')}",${r.weight ?? ''}`
    )
    downloadFile([...meta, ...lines].join('\n'), 'voical_export.csv', 'text/csv')
  }

  async function exportMarkdown() {
    const rows = await loadExportData()
    const age = computeAge(goals.birthdate)
    const profileMeta = `**Âge :** ${age ? age + ' ans' : 'non renseigné'} | **Taille :** ${goals.height_cm ? goals.height_cm + ' cm' : 'non renseignée'} | **Maintenance :** ${goals.calories} kcal/j`
    const header = '| Date | Calories | Protéines | Glucides | Lipides | Fibres | Sport | Activités | Poids |\n|------|----------|-----------|----------|---------|--------|-------|-----------|-------|'
    const lines = rows.map(r =>
      `| ${r.date} | ${r.calories} kcal | ${Math.round(r.proteins)}g | ${Math.round(r.carbs)}g | ${Math.round(r.fats)}g | ${Math.round(r.fibers)}g | ${r.burned > 0 ? `−${r.burned} kcal` : '—'} | ${r.activities.join(' + ') || '—'} | ${r.weight ? r.weight + ' kg' : '—'} |`
    )
    const content = `# Export nutritionnel Voical\n\n${profileMeta}\n\n${header}\n${lines.join('\n')}`
    downloadFile(content, 'voical_export.md', 'text/markdown')
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const age = computeAge(goals.birthdate)

  return (
    <div className="page">
      <h1>Paramètres</h1>

      <h2>Objectifs journaliers</h2>
      {GOAL_FIELDS.map(({ key, label, unit }) => (
        <Fragment key={key}>
          <div className="setting-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label>{label}</label>
              {key === 'calories' && maintEstimate && (
                <>
                  <span className="maint-estimate">≈ {maintEstimate.estimated_maintenance} kcal</span>
                  <button className="btn-info" onClick={() => setShowInfo(true)} title="Détails du calcul">i</button>
                </>
              )}
            </div>
            <div className="setting-input-wrap">
              <input type="number" value={goals[key]}
                onChange={e => setGoals(g => ({ ...g, [key]: parseInt(e.target.value) || 0 }))}
                className="input input-small" />
              <span className="setting-unit">{unit}</span>
            </div>
          </div>
          {key === 'calories' && (
            <>
              <button className="btn-ai" onClick={recalcMaintenance} disabled={maintLoading} style={{ marginTop: 8 }}>
                {maintLoading ? 'Calcul en cours…' : '✨ Recalculer ma maintenance'}
              </button>
              {maintError && <p className="ai-error" style={{ marginTop: 4 }}>{maintError}</p>}
            </>
          )}
        </Fragment>
      ))}

      <button className="btn-primary" style={{ marginTop: 16 }} onClick={saveGoals}>
        {saved ? '✓ Sauvegardé' : 'Enregistrer'}
      </button>

      <div className="export-row">
        <h2 style={{ marginBottom: 12 }}>Export des données</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={exportCSV}>⬇ CSV</button>
          <button className="btn-secondary" onClick={exportMarkdown}>⬇ Markdown</button>
        </div>
      </div>

      <h2>Profil</h2>
      <div className="setting-row">
        <label>Date de naissance</label>
        <input type="date" value={goals.birthdate || ''} className="input input-small"
          onChange={e => setGoals(g => ({ ...g, birthdate: e.target.value }))}
          onBlur={saveGoals} />
      </div>
      {age !== null && <p className="setting-age">Âge calculé : {age} ans</p>}
      <div className="setting-row">
        <label>Taille</label>
        <div className="setting-input-wrap">
          <input type="number" value={goals.height_cm || ''} placeholder="187" className="input input-small"
            onChange={e => setGoals(g => ({ ...g, height_cm: parseInt(e.target.value) || '' }))}
            onBlur={saveGoals} />
          <span className="setting-unit">cm</span>
        </div>
      </div>

      <button className="btn-danger" style={{ marginTop: 24 }} onClick={logout}>Se déconnecter</button>

      {showInfo && maintEstimate && (
        <div className="modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Détails du calcul</h3>
              <button className="btn-info" onClick={() => setShowInfo(false)}>×</button>
            </div>
            {(() => {
              const w = maintEstimate.formula_weight
              const h = parseInt(goals.height_cm)
              const a = computeAge(goals.birthdate)
              const bmr = maintEstimate.formula_bmr ?? Math.round(10 * w + 6.25 * h - 5 * a + 5)
              const sedentary = maintEstimate.formula_sedentary ?? Math.round(bmr * 1.2)
              return (
                <>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '12px 0 8px' }}>
                    Mifflin-St Jeor (homme) · {w} kg
                  </p>
                  <div className="activity-calc-rows">
                    <div className="activity-calc-row">
                      <span style={{ color: 'var(--text-muted)' }}>10 × {w} kg</span>
                      <span>{10 * w}</span>
                    </div>
                    <div className="activity-calc-row">
                      <span style={{ color: 'var(--text-muted)' }}>+ 6,25 × {h} cm</span>
                      <span>+ {Math.round(6.25 * h)}</span>
                    </div>
                    <div className="activity-calc-row">
                      <span style={{ color: 'var(--text-muted)' }}>− 5 × {a} ans</span>
                      <span>− {5 * a}</span>
                    </div>
                    <div className="activity-calc-row">
                      <span style={{ color: 'var(--text-muted)' }}>+ 5 (homme)</span>
                      <span>= MB {bmr} kcal</span>
                    </div>
                    <div className="activity-calc-row">
                      <span style={{ color: 'var(--text-muted)' }}>× 1,2 — journée canapé</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{sedentary} kcal/j</span>
                    </div>
                    <div className="activity-calc-row activity-calc-total">
                      <span style={{ color: 'var(--text-muted)' }}>× 1,55 — modérément actif</span>
                      <span style={{ color: 'var(--cal)', fontWeight: 700 }}>{maintEstimate.formula_estimate} kcal/j</span>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
