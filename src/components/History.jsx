import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function localToday() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}

function shiftDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function dayLabel(dateStr, period) {
  const d = new Date(dateStr + 'T12:00:00')
  return period === 'week' ? DAY_SHORT[d.getDay()] : String(d.getDate())
}

function BarChart({ data, color, goal }) {
  if (!data.length) return <p className="chart-empty">Pas de données</p>
  const max = Math.max(...data.map(d => d.value), goal || 0, 1) * 1.15
  const W = 320, H = 90, count = data.length
  const barW = Math.max(3, Math.min(22, (W - 20) / count - 4))
  const spacing = (W - 20) / count

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%' }}>
      {goal > 0 && (
        <line
          x1={6} y1={H - (goal / max) * H}
          x2={W - 6} y2={H - (goal / max) * H}
          stroke={color} strokeOpacity={0.4} strokeDasharray="5 3" strokeWidth={1.5}
        />
      )}
      {data.map((d, i) => {
        const cx = 10 + i * spacing + spacing / 2
        const bh = Math.max(2, (d.value / max) * H)
        const showLabel = count <= 7 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={H - bh} width={barW} height={bh} rx={2} fill={color} opacity={0.85} />
            {showLabel && (
              <text x={cx} y={H + 13} textAnchor="middle" fontSize={9} fill="#8e8e93">{d.label}</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data, color, unit = '' }) {
  if (!data.length) return <p className="chart-empty">Pas de données</p>
  if (data.length === 1) return (
    <p style={{ color, textAlign: 'center', fontSize: 22, fontWeight: 700, padding: '8px 0' }}>
      {data[0].value} {unit}
    </p>
  )

  const vals = data.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const W = 320, H = 80, count = data.length

  const pts = data.map((d, i) => ({
    x: 10 + (i / (count - 1)) * (W - 20),
    y: H - 8 - ((d.value - min) / range) * (H - 20),
    ...d,
  }))

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: '100%' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => {
        const showLabel = count <= 7 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} />
            {showLabel && <>
              <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize={9} fill={color}>
                {p.value}{unit}
              </text>
              <text x={p.x} y={H + 13} textAnchor="middle" fontSize={9} fill="#8e8e93">
                {p.label}
              </text>
            </>}
          </g>
        )
      })}
    </svg>
  )
}

export default function History({ userId }) {
  const [period, setPeriod] = useState('week')
  const [days, setDays] = useState([])
  const [goals, setGoals] = useState({ calories: 2000, proteins: 150 })

  useEffect(() => { loadHistory() }, [period, userId])

  async function loadHistory() {
    const n = period === 'week' ? 7 : 30
    const today = localToday()
    const startDate = shiftDate(today, -(n - 1))

    const [{ data: goalsData }, { data: meals }, { data: activities }, { data: weights }] = await Promise.all([
      supabase.from('user_goals').select('calories,proteins').eq('user_id', userId).maybeSingle(),
      supabase.from('meals').select('date,calories,proteins').eq('user_id', userId).gte('date', startDate).order('date'),
      supabase.from('activities').select('date,name,type,calories_burned').eq('user_id', userId).gte('date', startDate).order('date'),
      supabase.from('weight_logs').select('date,weight').eq('user_id', userId).gte('date', startDate).order('date'),
    ])

    if (goalsData) setGoals(goalsData)

    const range = Array.from({ length: n }, (_, i) => shiftDate(startDate, i))
    const byDate = Object.fromEntries(range.map(d => [d, { calories: 0, proteins: 0, burned: 0, weight: null, activities: [] }]))

    for (const m of (meals || [])) {
      if (byDate[m.date]) {
        byDate[m.date].calories += m.calories || 0
        byDate[m.date].proteins += m.proteins || 0
      }
    }
    for (const a of (activities || [])) {
      if (byDate[a.date]) {
        byDate[a.date].burned += a.calories_burned || 0
        byDate[a.date].activities.push(a)
      }
    }
    for (const w of (weights || [])) {
      if (byDate[w.date]) byDate[w.date].weight = w.weight
    }

    setDays(range.map(date => ({ date, ...byDate[date] })))
  }

  const calData    = days.map(d => ({ label: dayLabel(d.date, period), value: Math.max(0, Math.round(d.calories - d.burned)) }))
  const protData   = days.map(d => ({ label: dayLabel(d.date, period), value: Math.round(d.proteins) }))
  const weightData = days.filter(d => d.weight !== null).map(d => ({ label: dayLabel(d.date, period), value: d.weight }))
  const actDays    = days.filter(d => d.activities.length > 0)

  return (
    <div className="page">
      <h1>Historique</h1>

      <div className="toggle">
        <button className={period === 'week'  ? 'active' : ''} onClick={() => setPeriod('week')}>7 jours</button>
        <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>30 jours</button>
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Poids</h2>
        <LineChart data={weightData} color="var(--cal)" unit=" kg" />
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Calories nettes <span className="hist-goal">objectif {goals.calories} kcal</span></h2>
        <BarChart data={calData} color="var(--cal)" goal={goals.calories} />
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Protéines <span className="hist-goal">objectif {goals.proteins} g</span></h2>
        <BarChart data={protData} color="var(--prot)" goal={goals.proteins} />
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Activité sportive</h2>
        {actDays.length === 0
          ? <p className="empty">Aucune activité sur cette période</p>
          : actDays.map(d => (
            <div key={d.date} className="activity-day">
              <span className="activity-day-date">
                {new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <div>
                {d.activities.map((a, i) => (
                  <span key={i} className="activity-tag">🏃 {a.name} −{Math.round(a.calories_burned)} kcal</span>
                ))}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  )
}
