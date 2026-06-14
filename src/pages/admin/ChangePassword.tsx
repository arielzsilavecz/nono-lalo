import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Logo } from '../../components/Logo'
import { Button, Card, ErrorText, Field, Input } from '../../components/ui'

export function ChangePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    })
    setSaving(false)
    if (updateError) {
      setError('No se pudo cambiar la contraseña. Probá de nuevo.')
      return
    }
    navigate('/admin')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-crema-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo height="h-10" />
          <p className="mt-2 text-sm font-semibold text-navy-700">
            Es tu primer acceso — elegí tu contraseña
          </p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Repetir contraseña">
              <Input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Guardando…' : 'Cambiar contraseña y entrar'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
