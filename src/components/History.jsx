import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function History({ userId }) {
  const [period, setPeriod] = useState('week')
  const [days, setDays] = useState([])

  useEffect(() => { loadHistory() }, [period, userId])

  async function loadHistory() {
    const start = new Date()
    start.setDate(start.getDate() - (period === 'week' ? 7 : 30))
    const startDate = start.toISOString().split('T')[0]

    const [{ data: meals }, { data: activities }] = await Promise.all([
      supabase.from('meals').select('*').eq('user_id', userId).gte('date', startDate).order('date'),
      supabase.from('activities').select('*').eq('user_id', userId).gte('date', startDate).order('date'),
    ])

    const byDate = {}
    for (const m of (meals || [])) {
      if (!byDate[m.date]) byDate[m.date] = { meals: [], activities: [], cal: 0, prot: 0, carb: 0, fat: 0, fib: 0, burned: 0 }
      byDate[m.date].cal  += m.calories || 0
      byDate[m.date].prot += m.proteins || 0
      byDate[m.date].carb += m.carbs    || 0
      byDate[m.date].fat  += m.fats     || 0
      byDate[m.date].fib  += m.fibers   || 0
      byDate[m.date].meals.push(m)
    }
    for (const a of (activities || [])) {
      if (!byDate[a.date]) byDate[a.date] = { meals: [], activities: [], cal: 0, prot: 0, carb: 0, fat: 0, fib: 0, burned: 0 }
      byDate[a.date].burned += a.calories_burned || 0
      byDate[a.date].activities.push(a)
    }

    setDays(Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])))
  }

  const avg = days.reduce((acc, [, d]) => ({
    cal:  acc.cal  + d.cal - d.burned,
    prot: acc.prot + d.prot,
    carb: acc.carb + d.carb,
    fat:  acc.fat  + d.fat,
    fib:  acc.fib  + d.fib,
    n:    acc.n + 1,
  }), { cal: 0, prot: 0, carb: 0, fat: 0, fib: 0, n: 0 })

  return (
    <div className="page">
      <h1>Historique</h1>

      <div className="toggle">
        <button className={period === 'week'  ? 'active' : ''} onClick={() => setPeriod('week')}>7 jours</button>
        <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>30 jours</button>
      </div>

      {avg.n > 0 && (
        <div className="summary-card">
          <p className="summary-title">Moyenne / jour sur {avg.n} jours</p>
          <p className="summary-cal">{Math.round(avg.cal / avg.n)} kcal nets</p>
          <div className="summary-row">
            <span style={{ color: 'var(--prot)' }}>P {Math.round(avg.prot / avg.n)}g</span>
            <span style={{ color: 'var(--carb)' }}>G {Math.round(avg.carb / avg.n)}g</span>
            <span style={{ color: 'var(--fat)'  }}>L {Math.round(avg.fat  / avg.n)}g</span>
            <span style={{ color: 'var(--fib)'  }}>F {Math.round(avg.fib  / avg.n)}g</span>
          </div>
        </div>
      )}

      {days.length === 0 && <p className="empty">Aucune donnée sur cette période.</p>}

      {days.map(([date, d]) => (
        <div key={date} className="day-card">
          <p className="day-date">
            {new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="day-cal" style={{ color: 'var(--cal)' }}>{Math.round(d.cal - d.burned)} kcal nets</p>
          <div className="day-macros">
            <span style={{ color: 'var(--prot)' }}>P {Math.round(d.prot)}g</span>
            <span style={{ color: 'var(--carb)' }}>G {Math.round(d.carb)}g</span>
            <span style={{ color: 'var(--fat)'  }}>L {Math.round(d.fat)}g</span>
            <span style={{ color: 'var(--fib)'  }}>F {Math.round(d.fib)}g</span>
          </div>
          {d.activities.map(a => (
            <span key={a.id} className="activity-tag">🏃 {a.name} −{Math.round(a.calories_burned)} kcal</span>
          ))}
        </div>
      ))}
    </div>
  )
}
