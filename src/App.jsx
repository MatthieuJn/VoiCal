import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import History from './components/History'
import Settings from './components/Settings'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('today')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div className="splash">Chargement…</div>
  if (!session)  return <Auth />

  return (
    <div className="app">
      <main className="main-content">
        {tab === 'today'    && <Dashboard userId={session.user.id} />}
        {tab === 'history'  && <History   userId={session.user.id} />}
        {tab === 'settings' && <Settings  userId={session.user.id} />}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setTab('today')}    className={tab === 'today'    ? 'active' : ''}>
          <span>🍽️</span>Aujourd'hui
        </button>
        <button onClick={() => setTab('history')}  className={tab === 'history'  ? 'active' : ''}>
          <span>📊</span>Historique
        </button>
        <button onClick={() => setTab('settings')} className={tab === 'settings' ? 'active' : ''}>
          <span>⚙️</span>Paramètres
        </button>
      </nav>
    </div>
  )
}
