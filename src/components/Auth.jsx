import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function handleAuth() {
    setLoading(true)
    setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Vérifie ton email pour confirmer ton compte.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>🥗 Voical</h1>
        <p className="auth-subtitle">Suivi nutritionnel</p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="input"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="input"
          onKeyDown={e => e.key === 'Enter' && handleAuth()}
        />

        {message && <p className="auth-message">{message}</p>}

        <button className="btn-primary" onClick={handleAuth} disabled={loading}>
          {loading ? '…' : isSignUp ? 'Créer un compte' : 'Connexion'}
        </button>
        <button className="btn-ghost" onClick={() => { setIsSignUp(!isSignUp); setMessage('') }}>
          {isSignUp ? 'Déjà un compte ? Se connecter' : "Pas de compte ? S'inscrire"}
        </button>
      </div>
    </div>
  )
}
