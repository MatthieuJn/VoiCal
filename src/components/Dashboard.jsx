import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { parseMealInput } from '../lib/parser'
import Gauge from './Gauge'

const DEFAULT_GOALS = { calories: 2000, proteins: 150, carbs: 200, fats: 70, fibers: 30 }

export default function Dashboard({ userId }) {
  const [meals, setMeals] = useState([])
  const [activities, setActivities] = useState([])
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [showMealModal, setShowMealModal] = useState(false)
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [mealName, setMealName] = useState('')
  const [mealInput, setMealInput] = useState('')
  const [activityName, setActivityName] = useState('')
  const [activityType, setActivityType] = useState('sport')
  const [activityCalories, setActivityCalories] = useState('')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { loadData() }, [userId])

  async function loadData() {
    const { data: g } = await supabase.from('user_goals').select('*').eq('user_id', userId).maybeSingle()
    if (g) setGoals(g)

    const { data: m } = await supabase.from('meals').select('*').eq('user_id', userId).eq('date', today).order('created_at')
    setMeals(m || [])

    const { data: a } = await supabase.from('activities').select('*').eq('user_id', userId).eq('date', today).order('created_at')
    setActivities(a || [])
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

  async function addMeal() {
    if (!parsed || parsed.calories === 0) return
    await supabase.from('meals').insert({
      user_id: userId, date: today,
      name: mealName || 'Repas',
      raw_input: mealInput,
      ...parsed,
    })
    setShowMealModal(false)
    setMealName(''); setMealInput('')
    loadData()
  }

  async function addActivity() {
    if (!activityName || !activityCalories) return
    await supabase.from('activities').insert({
      user_id: userId, date: today,
      name: activityName, type: activityType,
      calories_burned: parseFloat(activityCalories),
    })
    setShowActivityModal(false)
    setActivityName(''); setActivityCalories('')
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

  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="dashboard">
      <h1>Aujourd'hui</h1>
      <p className="date-label">{dateLabel}</p>

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
          <div key={m.id} className="entry-card">
            <div className="entry-info">
              <strong>{m.name}</strong>
              <span className="entry-macros">{Math.round(m.calories)} kcal · P:{Math.round(m.proteins)}g · G:{Math.round(m.carbs)}g · L:{Math.round(m.fats)}g</span>
            </div>
            <button className="btn-delete" onClick={() => deleteMeal(m.id)}>×</button>
          </div>
        ))}
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
        <div className="modal-overlay" onClick={() => setShowMealModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Ajouter un repas</h3>
            <input placeholder="Nom du repas (ex: Déjeuner)" value={mealName}
              onChange={e => setMealName(e.target.value)} className="input" />
            <textarea placeholder="Colle ici le détail du repas en markdown…" value={mealInput}
              onChange={e => setMealInput(e.target.value)} className="textarea" rows={10} />
            {parsed && parsed.calories > 0 && (
              <div className="parse-preview">
                ✓ {Math.round(parsed.calories)} kcal · P:{Math.round(parsed.proteins)}g · G:{Math.round(parsed.carbs)}g · L:{Math.round(parsed.fats)}g · F:{Math.round(parsed.fibers)}g
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowMealModal(false)}>Annuler</button>
              <button className="btn-primary" onClick={addMeal} disabled={!parsed || parsed.calories === 0}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showActivityModal && (
        <div className="modal-overlay" onClick={() => setShowActivityModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Ajouter une activité</h3>
            <input placeholder="Nom (ex: Vélo matinal)" value={activityName}
              onChange={e => setActivityName(e.target.value)} className="input" />
            <select value={activityType} onChange={e => setActivityType(e.target.value)} className="input">
              <option value="sport">Sport</option>
              <option value="velo">Vélo</option>
              <option value="marche">Marche</option>
              <option value="course">Course</option>
              <option value="autre">Autre</option>
            </select>
            <input type="number" placeholder="Calories brûlées (kcal)" value={activityCalories}
              onChange={e => setActivityCalories(e.target.value)} className="input" />
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
