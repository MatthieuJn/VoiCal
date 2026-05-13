import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const DAY_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

const ACTIVITY_EMOJIS = {
  muscu_salle:     '🏋️',
  muscu_pdc:       '🏋️',
  muscu_avantbras: '🏋️',
  velo:            '🚴',
  marche:          '🚶',
  course:          '🏃',
  autre:           '⚡',
}

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
  return period === 'week' ? DAY_FULL[d.getDay()] : String(d.getDate())
}

function sleepDuration(bedtime, wakeup) {
  if (!bedtime || !wakeup) return null
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeup.split(':').map(Number)
  let mins = (wh * 60 + wm) - (bh * 60 + bm)
  if (mins < 0) mins += 24 * 60
  return Math.round(mins / 6) / 10
}

function BarChart({ data, color, goal, period }) {
  const [sel, setSel] = useState(null)
  if (!data.length) return <p className="chart-empty">Pas de données</p>

  const max = Math.max(...data.map(d => d.value), goal || 0, 1) * 1.15
  const isWeek = period === 'week'
  const W = 320, H = 90
  const labelH = isWeek ? 38 : 16
  const count = data.length
  const barW = Math.max(3, Math.min(22, (W - 20) / count - 4))
  const spacing = (W - 20) / count

  return (
    <div>
      {sel !== null && data[sel] && (
        <p className="chart-tooltip" style={{ color }}>
          {data[sel].label} — <strong>{data[sel].value}</strong>
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H + labelH}`} style={{ width: '100%' }}>
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
          const isSel = sel === i
          const showNum = count <= 7 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0

          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
              <rect
                x={cx - barW / 2} y={H - bh}
                width={barW} height={bh}
                rx={2} fill={color}
                opacity={isSel ? 1 : 0.75}
              />
              {isSel && (
                <text x={cx} y={H - bh - 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill={color}>
                  {d.value}
                </text>
              )}
              {isWeek ? (
                <text
                  transform={`translate(${cx}, ${H + 4}) rotate(-40)`}
                  textAnchor="end" fontSize={9} fill="#8e8e93"
                >
                  {d.label}
                </text>
              ) : showNum && (
                <text x={cx} y={H + 13} textAnchor="middle" fontSize={9} fill="#8e8e93">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function LineChart({ data, color, unit = '', period }) {
  const [sel, setSel] = useState(null)
  if (!data.length) return <p className="chart-empty">Pas de données</p>
  if (data.length === 1) return (
    <p style={{ color, textAlign: 'center', fontSize: 22, fontWeight: 700, padding: '8px 0' }}>
      {data[0].value} {unit}
    </p>
  )

  const vals = data.map(d => d.value)
  const min = Math.min(...vals), max = Math.max(...vals)
  const range = max - min || 1
  const isWeek = period === 'week'
  const W = 320, H = 80
  const labelH = isWeek ? 38 : 16
  const count = data.length

  const pts = data.map((d, i) => ({
    x: 10 + (i / (count - 1)) * (W - 20),
    y: H - 8 - ((d.value - min) / range) * (H - 20),
    ...d,
  }))

  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <div>
      {sel !== null && pts[sel] && (
        <p className="chart-tooltip" style={{ color }}>
          {pts[sel].label} — <strong>{pts[sel].value}{unit}</strong>
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H + labelH}`} style={{ width: '100%' }}>
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => {
          const isSel = sel === i
          const showLabel = count <= 7 || i === 0 || i === count - 1 || i % Math.ceil(count / 6) === 0
          return (
            <g key={i} onClick={() => setSel(sel === i ? null : i)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={isSel ? 5 : 3} fill={color} />
              {isSel && (
                <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize={9} fontWeight="bold" fill={color}>
                  {p.value}{unit}
                </text>
              )}
              {isWeek ? (
                <text
                  transform={`translate(${p.x}, ${H + 4}) rotate(-40)`}
                  textAnchor="end" fontSize={9} fill="#8e8e93"
                >
                  {p.label}
                </text>
              ) : showLabel && (
                <text x={p.x} y={H + 13} textAnchor="middle" fontSize={9} fill="#8e8e93">
                  {p.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
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
      supabase.from('activities').select('date,name,calories_burned,type').eq('user_id', userId).gte('date', startDate).order('date'),
      supabase.from('weight_logs').select('date,weight,bedtime,wakeup').eq('user_id', userId).gte('date', startDate).order('date'),
    ])

    if (goalsData) setGoals(goalsData)

    const range = Array.from({ length: n }, (_, i) => shiftDate(startDate, i))
    const byDate = Object.fromEntries(range.map(d => [d, { calories: 0, proteins: 0, burned: 0, weight: null, bedtime: null, wakeup: null, activities: [] }]))

    for (const m of (meals || [])) {
      if (byDate[m.date]) { byDate[m.date].calories += m.calories || 0; byDate[m.date].proteins += m.proteins || 0 }
    }
    for (const a of (activities || [])) {
      if (byDate[a.date]) { byDate[a.date].burned += a.calories_burned || 0; byDate[a.date].activities.push(a) }
    }
    for (const w of (weights || [])) {
      if (byDate[w.date]) { byDate[w.date].weight = w.weight; byDate[w.date].bedtime = w.bedtime; byDate[w.date].wakeup = w.wakeup }
    }

    setDays(range.map(date => ({ date, ...byDate[date] })))
  }

  const calData    = days.map(d => ({ label: dayLabel(d.date, period), value: Math.max(0, Math.round(d.calories - d.burned)) }))
  const protData   = days.map(d => ({ label: dayLabel(d.date, period), value: Math.round(d.proteins) }))
  const weightData = days.filter(d => d.weight !== null).map(d => ({ label: dayLabel(d.date, period), value: d.weight }))
  const sleepData  = days
    .map(d => ({ label: dayLabel(d.date, period), value: sleepDuration(d.bedtime, d.wakeup) }))
    .filter(d => d.value !== null)
  const actDays    = days.filter(d => d.activities.length > 0)

  const deficitDays = days
    .filter(d => d.calories > 0)
    .map(d => {
      const dt = new Date(d.date + 'T12:00:00')
      return {
        date: d.date,
        isMonday: dt.getDay() === 1,
        label: dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
        consumed: Math.round(d.calories),
        burned: Math.round(d.burned),
        proteins: Math.round(d.proteins),
        deficit: Math.round(goals.calories - (d.calories - d.burned)),
        activityEmojis: [...new Set(d.activities.map(a => ACTIVITY_EMOJIS[a.type] || '⚡'))],
      }
    })
  const totalDeficit = deficitDays.reduce((s, d) => s + d.deficit, 0)

  return (
    <div className="page">
      <h1>Historique</h1>

      <div className="toggle">
        <button className={period === 'week'  ? 'active' : ''} onClick={() => setPeriod('week')}>7 jours</button>
        <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>30 jours</button>
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Poids</h2>
        <LineChart data={weightData} color="var(--cal)" unit=" kg" period={period} />
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Calories nettes <span className="hist-goal">objectif {goals.calories} kcal</span></h2>
        <BarChart data={calData} color="var(--cal)" goal={goals.calories} period={period} />
      </div>

      {deficitDays.length > 0 && (
        <div className="hist-section">
          <h2 className="hist-title">
            Déficit cumulé
            <span className="hist-goal">objectif {goals.calories} kcal/j</span>
          </h2>
          <div className={`deficit-total ${totalDeficit >= 0 ? 'deficit-positive' : 'deficit-negative'}`}>
            {totalDeficit >= 0 ? '−' : '+'}{Math.abs(totalDeficit)} kcal
            <span className="deficit-total-label">
              {totalDeficit >= 0 ? 'déficit cumulé' : 'excédent cumulé'}
            </span>
          </div>
          <div className="deficit-rows">
            {deficitDays.map((d, i) => (
              <div key={i}>
                {d.isMonday && i > 0 && <div className="week-separator" />}
                <div className="deficit-row">
                  <span className="deficit-day">{d.label}</span>
                  <span className="deficit-proteins">P{d.proteins}</span>
                  <span className="deficit-eaten">▲ {d.consumed}</span>
                  {d.burned > 0 && (
                    <span className="deficit-burned">
                      ▼ {d.burned}{d.activityEmojis.length > 0 && <span className="activity-emojis">{d.activityEmojis.join('')}</span>}
                    </span>
                  )}
                  <span className={`deficit-val ${d.deficit >= 0 ? 'deficit-positive' : 'deficit-negative'}`}>
                    {d.deficit >= 0 ? '−' : '+'}{Math.abs(d.deficit)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hist-section">
        <h2 className="hist-title">Protéines <span className="hist-goal">objectif {goals.proteins} g</span></h2>
        <BarChart data={protData} color="var(--prot)" goal={goals.proteins} period={period} />
      </div>

      <div className="hist-section">
        <h2 className="hist-title">Sommeil <span className="hist-goal">heures / nuit</span></h2>
        <BarChart data={sleepData} color="#5e5ce6" period={period} />
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
