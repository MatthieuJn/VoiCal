export default function Gauge({ label, current, goal, color, unit = 'g' }) {
  const size = 60
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const pct = goal > 0 ? Math.min(100, (current / goal) * 100) : 0
  const over = current > goal
  const dashOffset = circ - (pct / 100) * circ
  const remaining = Math.round(goal - current)

  return (
    <div className="gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--border)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={over ? 'var(--danger)' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize="11" fontWeight="700"
          fill={over ? 'var(--danger)' : 'var(--text)'}>
          {Math.round(current)}
        </text>
        <text x={size / 2} y={size / 2 + 9} textAnchor="middle" fontSize="8" fill="var(--text-muted)">
          /{goal}
        </text>
      </svg>
      <p className="gauge-label">{label}</p>
      <p className="gauge-rem" style={{ color: over ? 'var(--danger)' : color }}>
        {over ? `+${Math.abs(remaining)}` : remaining} {unit}
      </p>
    </div>
  )
}
