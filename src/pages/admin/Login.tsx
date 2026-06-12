import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Logo } from '../../components/Logo'
import { Mascot } from '../../components/Mascot'
import { Button, Card, ErrorText, Field, Input } from '../../components/ui'

export function Login() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (session) navigate('/admin', { replace: true })
  }, [session, navigate])

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (authError) {
      setError('Email o contraseña incorrectos.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-crema-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Mascot className="h-24 w-24" />
          <Logo className="text-4xl" />
          <p className="text-sm text-navy-500">Acceso a la cocina</p>
        </div>
        <Card>
          <form onSubmit={signIn} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
