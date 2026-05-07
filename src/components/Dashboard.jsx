import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { parseMealInput } from '../lib/parser'
import { analyzeMeal, analyzeMealFromPhoto, recalculateMeal, computeTotals, GEMINI_MODEL } from '../lib/gemini'
import Gauge from './Gauge'

const DEFAULT_GOALS = { calories: 2000, proteins: 150, carbs: 200, fats: 70, fibers: 30 }

const ACTIVITY_TYPES = [
  { value: 'muscu_salle',     label: 'Muscu (salle)' },
  { value: 'muscu_pdc',       label: 'Muscu (poids de corps)' },
  { value: 'muscu_avantbras', label: 'Muscu (avant-bras)' },
  { value: 'velo',            label: 'Vélo' },
  { value: 'marche',          label: 'Marche' },
  { value: 'course',          label: 'Course' },
  { value: 'autre',           label: 'Autre' },
]

const CARDIO_TYPES = ['velo', 'marche']

export default function Dashboard({ userId }) {
  const [meals, setMeals] = useState([])
  const [activities, setActivities] = useState([])
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [weight, setWeight] = useState('')
  const [savedWeight, setSavedWeight] = useState(null)
  const [bedtime, setBedtime] = useState('')
  const [savedBedtime, setSavedBedtime] = useState(null)
  const [showMealModal, setShowMealModal] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [mealName, setMealName] = useState('')
  const [mealInput, setMealInput] = useState('')
  const [aiResult, setAiResult] = useState(null)
  const [editableIngredients, setEditableIngredients] = useState([])
  const [detailMeal, setDetailMeal] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRecalcLoading, setAiRecalcLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef(null)
  const fileInputRef = useRef(null)
  const [activityName, setActivityName] = useState('')
  const [activityType, setActivityType] = useState('muscu_salle')
  const [activityCalories, setActivityCalories] = useState('')
  const [activityDuration, setActivityDuration] = useState('')

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [selectedDate, setSelectedDate] = useState(today)

  useEffect(() => { loadData() }, [userId, selectedDate])

  function prevDay() {
    setSelectedDate(d => {
      const dt = new Date(d + 'T12:00:00')
      dt.setDate(dt.getDate() - 1)
      return dt.toISOString().split('T')[0]
    })
  }

  function nextDay() {
    if (selectedDate >= today) return
    setSelectedDate(d => {
      const dt = new Date(d + 'T12:00:00')
      dt.setDate(dt.getDate() + 1)
      return dt.toISOString().split('T')[0]
    })
  }

  async function loadData() {
    const { data: g } = await supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle()
    if (g) setGoals(g)

    const { data: m } = await supabase.from('meals').select('*').eq('user_id', userId).eq('date', selectedDate).order('created_at')
    setMeals(m || [])

    const { data: a } = await supabase.from('activities').select('*').eq('user_id', userId).eq('date', selectedDate).order('created_at')
    setActivities(a || [])

    const { data: w } = await supabase.from('weight_logs').select('weight,bedtime').eq('user_id', userId).eq('date', selectedDate).maybeSingle()
    if (w) { setSavedWeight(w.weight); setSavedBedtime(w.bedtime || null) }
  }

  const totals = meals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    proteins: acc.proteins + (m.proteins || 0),
    carbs:    acc.carbs    + (m.carbs    || 0),
    fats:     acc.fats     + (m.fats     || 0),
    fibers:   acc.fibers   + (m.fibers   || 0),
  }), { calories: 0, proteins: 0, carbs: 0, fats: 0, fibers: 0 })

  const burnedCalories = activities.reduce((acc, a) => acc + (a.calories_burned || 0), 0)
  const netCalories = totals.calories - burnedCalories

  const parsed = mealInput ? parseMealInput(mealInput) : null

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Reconnaissance vocale non supportée sur ce navigateur.'); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.continuous = false
    rec.interimResults = false
    rec.onstart = () => setListening(true)
    rec.onend   = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.onresult = e => {
      const transcript = e.results[0][0].transcript
      setMealInput(prev => prev ? prev + ' ' + transcript : transcript)
    }
    rec.start()
    recRef.current = rec
  }

  function stopListening() {
    recRef.current?.stop()
    setListening(false)
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setSelectedImage(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    setAiResult(null)
    setEditableIngredients([])
  }

  function removeImage() {
    setSelectedImage(null)
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function resetModal() {
    setShowMealModal(false)
    setMealName('')
    setMealInput('')
    setAiResult(null)
    setEditableIngredients([])
    removeImage()
  }

  async function analyzeWithAI() {
    if (!mealInput.trim() && !selectedImage) return
    setAiLoading(true)
    setAiError('')
    setAiResult(null)
    setEditableIngredients([])
    try {
      let result
      if (selectedImage) {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(selectedImage)
        })
        result = await analyzeMealFromPhoto(base64, selectedImage.type, mealInput)
      } else {
        result = await analyzeMeal(mealInput)
      }
      setAiResult(result)
      setEditableIngredients(result.ingredients)
      if (result.name && !mealName) setMealName(result.name)
    } catch {
      setAiError('Erreur Gemini. Vérifie ta clé API.')
    }
    setAiLoading(false)
  }

  async function handleRecalculate() {
    setAiRecalcLoading(true)
    setAiError('')
    try {
      const result = await recalculateMeal(editableIngredients, mealInput)
      setAiResult(result)
      setEditableIngredients(result.ingredients)
    } catch {
      setAiError('Erreur lors du recalcul.')
    }
    setAiRecalcLoading(false)
  }

  function updateIngredient(index, field, value) {
    setEditableIngredients(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 }
      return updated
    })
  }

  async function addMeal() {
    const data = aiResult
      ? computeTotals(editableIngredients)
      : parsed
    if (!data || data.calories === 0) return

    const payload = {
      user_id: userId, date: selectedDate,
      name: mealName || 'Repas',
      raw_input: mealInput,
      calories: data.calories,
      proteins: data.proteins,
      carbs:    data.carbs,
      fats:     data.fats,
      fibers:   data.fibers,
      ingredients: editableIngredients.length > 0 ? editableIngredients : null,
    }

    let { error } = await supabase.from('meals').insert(payload)
    if (error) {
      const { ingredients: _ignored, ...payloadWithout } = payload
      await supabase.from('meals').insert(payloadWithout)
    }

    resetModal()
    loadData()
  }

  async function addActivity() {
    if (!activityName || !activityCalories) return
    const isCardio = CARDIO_TYPES.includes(activityType)
    const total = parseFloat(activityCalories)
    const net = isCardio && activityDuration
      ? Math.max(0, total - (80 * parseFloat(activityDuration) / 60))
      : total
    await supabase.from('activities').insert({
      user_id: userId, date: selectedDate,
      name: activityName, type: activityType,
      calories_burned: Math.round(net),
    })
    setShowActivityModal(false)
    setActivityName(''); setActivityCalories(''); setActivityDuration('')
    loadData()
  }

  async function deleteMeal(id) {
    await supabase.from('meals').delete().eq('id', id)
    loadData()
  }

  async function deleteActivity(id) {
    await supabase.from('activities').delete().eq('id', id)
    loadData()
  }

  async function saveWeight() {
    if (!weight) return
    await supabase.from('weight_logs').upsert(
      { user_id: userId, date: selectedDate, weight: parseFloat(weight) },
      { onConflict: 'user_id,date' }
    )
    setSavedWeight(parseFloat(weight))
    setWeight('')
  }

  async function saveBedtime() {
    if (!bedtime) return
    const payload = { user_id: userId, date: selectedDate, bedtime }
    let { error } = await supabase.from('weight_logs').upsert(payload, { onConflict: 'user_id,date' })
    if (error) {
      const { bedtime: _b, ...fallback } = payload
      await supabase.from('weight_logs').upsert(fallback, { onConflict: 'user_id,date' })
    }
    setSavedBedtime(bedtime)
    setBedtime('')
  }

  const isToday = selectedDate === today
  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  const liveTotals = editableIngredients.length > 0 ? computeTotals(editableIngredients) : null

  return (
    <div className="dashboard">
      <div className="date-nav">
        <button className="date-nav-btn" onClick={prevDay}>‹</button>
        <div className="date-nav-center">
          <h1>{isToday ? "Aujourd'hui" : dateLabel}</h1>
          {!isToday && <p className="date-label">{dateLabel}</p>}
          {isToday && <p className="date-label">{dateLabel}</p>}
        </div>
        <button className="date-nav-btn" onClick={nextDay} disabled={isToday}>›</button>
      </div>

      <div className="gauges">
        <Gauge label="Calories" current={netCalories} goal={goals.calories} color="var(--cal)" unit="kcal" />
        <Gauge label="Protéines" current={totals.proteins} goal={goals.proteins} color="var(--prot)" />
        <Gauge label="Glucides"  current={totals.carbs}    goal={goals.carbs}    color="var(--carb)" />
        <Gauge label="Lipides"   current={totals.fats}     goal={goals.fats}     color="var(--fat)" />
        <Gauge label="Fibres"    current={totals.fibers}   goal={goals.fibers}   color="var(--fib)" />
      </div>

      <section>
        <div className="section-header">
          <h2>Repas</h2>
          <button className="btn-add" onClick={() => setShowMealModal(true)}>+ Ajouter</button>
        </div>
        {meals.length === 0 && <p className="empty">Aucun repas enregistré</p>}
        {meals.map(m => (
          <div key={m.id} className="entry-card" onClick={() => setDetailMeal(m)} style={{ cursor: 'pointer' }}>
            <div className="entry-info">
              <strong>{m.name}</strong>
              <span className="entry-macros">{Math.round(m.calories)} kcal · P:{Math.round(m.proteins)}g · G:{Math.round(m.carbs)}g · L:{Math.round(m.fats)}g</span>
            </div>
            <button className="btn-delete" onClick={e => { e.stopPropagation(); deleteMeal(m.id) }}>×</button>
          </div>
        ))}
      </section>

      <section>
        <div className="section-header">
          <h2>Poids</h2>
        </div>
        <div className="weight-row">
          {savedWeight && <span className="weight-saved">Aujourd'hui : <strong>{savedWeight} kg</strong></span>}
          <input
            type="number"
            step="0.1"
            placeholder="kg"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            className="input input-small"
            onKeyDown={e => e.key === 'Enter' && saveWeight()}
          />
          <button className="btn-add" onClick={saveWeight}>Enregistrer</button>
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Coucher</h2>
        </div>
        <div className="weight-row">
          {savedBedtime && <span className="weight-saved">🌙 <strong>{savedBedtime.slice(0,5)}</strong></span>}
          <input
            type="time"
            value={bedtime}
            onChange={e => setBedtime(e.target.value)}
            className="input input-small"
          />
          <button className="btn-add" onClick={saveBedtime}>Enregistrer</button>
        </div>
      </section>

      <section>
        <div className="section-header">
          <h2>Activités</h2>
          <button className="btn-add" onClick={() => setShowActivityModal(true)}>+ Ajouter</button>
        </div>
        {activities.length === 0 && <p className="empty">Aucune activité enregistrée</p>}
        {activities.map(a => (
          <div key={a.id} className="entry-card activity">
            <div className="entry-info">
              <strong>{a.name}</strong>
              <span className="entry-macros">−{Math.round(a.calories_burned)} kcal brûlées</span>
            </div>
            <button className="btn-delete" onClick={() => deleteActivity(a.id)}>×</button>
          </div>
        ))}
      </section>

      {showMealModal && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Ajouter un repas</h3>
              <button className="btn-info" onClick={() => setShowTemplate(v => !v)}>?</button>
            </div>
            {showTemplate && (
              <div className="template-box">
                <p className="template-title">Format attendu (output Claude) :</p>
                <pre className="template-code">{`## 🍽️ Détail du repas\n### Aliment (XXX g)\n- Calories : ~XXX kcal\n- Protéines : ~XXX g\n...\n## 🔢 Total du repas\n- **Calories : ~XXX kcal**`}</pre>
              </div>
            )}
            <input placeholder="Nom du repas (ex: Déjeuner)" value={mealName}
              onChange={e => setMealName(e.target.value)} className="input" />

            <div className="textarea-wrap">
              <textarea
                placeholder="Parle, tape, ou colle ton repas… (optionnel si photo)"
                value={mealInput}
                onChange={e => { setMealInput(e.target.value); setAiResult(null); setEditableIngredients([]) }}
                className="textarea" rows={4}
              />
              <button
                className={`btn-mic ${listening ? 'active' : ''}`}
                onClick={listening ? stopListening : startListening}
                title={listening ? 'Arrêter' : 'Dicter'}
              >
                {listening ? '⏹' : '🎙️'}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageSelect}
            />
            {imagePreviewUrl ? (
              <div className="photo-preview">
                <img src={imagePreviewUrl} alt="Repas" className="photo-img" />
                <button className="btn-remove-photo" onClick={removeImage}>× Retirer</button>
              </div>
            ) : (
              <button className="btn-photo" onClick={() => fileInputRef.current?.click()}>
                📷 Ajouter une photo
              </button>
            )}

            <button className="btn-ai" onClick={analyzeWithAI} disabled={aiLoading || (!mealInput.trim() && !selectedImage)}>
              {aiLoading ? 'Analyse en cours…' : selectedImage ? '✨ Analyser la photo' : '✨ Analyser avec Gemini'}
            </button>
            <p className="model-label">Modèle : {GEMINI_MODEL}</p>

            {aiError && <p className="ai-error">{aiError}</p>}

            {aiResult && editableIngredients.length > 0 && (
              <div className="ai-breakdown">
                <p className="breakdown-title">Détail par aliment</p>
                <div className="breakdown-table-wrap">
                  <table className="breakdown-table">
                    <thead>
                      <tr>
                        <th>Aliment</th>
                        <th>g</th>
                        <th>kcal</th>
                        <th>kcal/100g</th>
                        <th>P/100g</th>
                        <th>G/100g</th>
                        <th>L/100g</th>
                        <th>F/100g</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editableIngredients.map((ing, i) => {
                        const ingKcal = Math.round((ing.quantity_g / 100) * ing.kcal_per_100g)
                        return (
                          <tr key={i}>
                            <td className="ing-name">{ing.name}</td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.quantity_g}
                                onChange={e => updateIngredient(i, 'quantity_g', e.target.value)}
                              />
                            </td>
                            <td className="ing-kcal">{ingKcal}</td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.kcal_per_100g}
                                onChange={e => updateIngredient(i, 'kcal_per_100g', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.proteins_per_100g}
                                onChange={e => updateIngredient(i, 'proteins_per_100g', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.carbs_per_100g}
                                onChange={e => updateIngredient(i, 'carbs_per_100g', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.fats_per_100g}
                                onChange={e => updateIngredient(i, 'fats_per_100g', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="ing-input"
                                value={ing.fibers_per_100g}
                                onChange={e => updateIngredient(i, 'fibers_per_100g', e.target.value)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {liveTotals && (
                  <div className="parse-preview">
                    ✨ {Math.round(liveTotals.calories)} kcal · P:{Math.round(liveTotals.proteins)}g · G:{Math.round(liveTotals.carbs)}g · L:{Math.round(liveTotals.fats)}g · F:{Math.round(liveTotals.fibers)}g
                  </div>
                )}

                <button className="btn-recalc" onClick={handleRecalculate} disabled={aiRecalcLoading}>
                  {aiRecalcLoading ? 'Recalcul en cours…' : '🔄 Recalculer avec Gemini'}
                </button>
              </div>
            )}

            {!aiResult && parsed && parsed.calories > 0 && (
              <div className="parse-preview">
                ✓ {Math.round(parsed.calories)} kcal · P:{Math.round(parsed.proteins)}g · G:{Math.round(parsed.carbs)}g · L:{Math.round(parsed.fats)}g · F:{Math.round(parsed.fibers)}g
              </div>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={resetModal}>Annuler</button>
              <button className="btn-primary" onClick={addMeal}
                disabled={!aiResult && (!parsed || parsed.calories === 0)}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {detailMeal && (
        <div className="modal-overlay" onClick={() => setDetailMeal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>{detailMeal.name}</h3>
              <button className="btn-info" onClick={() => setDetailMeal(null)}>×</button>
            </div>

            {detailMeal.ingredients && detailMeal.ingredients.length > 0 && (
              <div className="detail-ingredients">
                {detailMeal.ingredients.map((ing, i) => {
                  const ingKcal = Math.round((ing.quantity_g / 100) * ing.kcal_per_100g)
                  const ingP    = Math.round((ing.quantity_g / 100) * ing.proteins_per_100g)
                  const ingG    = Math.round((ing.quantity_g / 100) * ing.carbs_per_100g)
                  const ingL    = Math.round((ing.quantity_g / 100) * ing.fats_per_100g)
                  return (
                    <div key={i} className="detail-ing-row">
                      <div className="detail-ing-header">
                        <span className="detail-ing-name">{ing.name}</span>
                        <span className="detail-ing-qty">{ing.quantity_g} g</span>
                      </div>
                      <div className="detail-ing-macros">
                        <span style={{ color: 'var(--cal)' }}>{ingKcal} kcal</span>
                        <span style={{ color: 'var(--prot)' }}>P {ingP}g</span>
                        <span style={{ color: 'var(--carb)' }}>G {ingG}g</span>
                        <span style={{ color: 'var(--fat)' }}>L {ingL}g</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="parse-preview">
              {Math.round(detailMeal.calories)} kcal · P:{Math.round(detailMeal.proteins)}g · G:{Math.round(detailMeal.carbs)}g · L:{Math.round(detailMeal.fats)}g · F:{Math.round(detailMeal.fibers)}g
            </div>
          </div>
        </div>
      )}

      {showActivityModal && (
        <div className="modal-overlay" onClick={() => setShowActivityModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Ajouter une activité</h3>
            <input placeholder="Nom (ex: Séance dos, Balade du soir…)" value={activityName}
              onChange={e => setActivityName(e.target.value)} className="input" />
            <select value={activityType} onChange={e => { setActivityType(e.target.value); setActivityDuration('') }} className="input">
              {ACTIVITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="number" placeholder="Calories brûlées (kcal, total appareil)" value={activityCalories}
              onChange={e => setActivityCalories(e.target.value)} className="input" />
            {CARDIO_TYPES.includes(activityType) && (
              <input type="number" placeholder="Durée (minutes)" value={activityDuration}
                onChange={e => setActivityDuration(e.target.value)} className="input" />
            )}
            {CARDIO_TYPES.includes(activityType) && activityCalories && activityDuration && (
              <div className="parse-preview">
                ✓ Net : {Math.round(Math.max(0, parseFloat(activityCalories) - (80 * parseFloat(activityDuration) / 60)))} kcal
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> (−{Math.round(80 * parseFloat(activityDuration) / 60)} kcal repos)</span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowActivityModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={addActivity}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
