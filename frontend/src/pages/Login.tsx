import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input } from '../components/ui'
import { Brand } from '../components/layout/Brand'
import { useAuth } from '../auth/AuthContext'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-sp5 bg-canvas">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm flex flex-col gap-sp5 p-sp8 bg-surface-lowest rounded-3 shadow-glow"
      >
        <header className="flex flex-col gap-sp3">
          <Brand to="/login" />
          <h1 className="font-display text-40 font-light leading-none tracking-tight text-ink-700">
            Sign In
          </h1>
          <p className="text-13 text-text-muted">
            Construction draw & invoice management.
          </p>
        </header>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="text-13 text-danger-500">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={submitting}>
          Sign in
        </Button>
      </form>
    </div>
  )
}
