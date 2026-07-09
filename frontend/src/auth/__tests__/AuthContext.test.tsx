import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../AuthContext'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))
import { api } from '../../api/client'
const mockGet = api.get as unknown as ReturnType<typeof vi.fn>
const mockPost = api.post as unknown as ReturnType<typeof vi.fn>

const ME = {
  id: 'u1',
  firm_id: 'f',
  email: 'admin@demo.test',
  full_name: 'Alex Thornton',
}

function Probe() {
  const { user, loading, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="user">{user?.email ?? 'anonymous'}</span>
      <button onClick={() => void login('a@b.com', 'pw')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  )
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in loading state and resolves to anonymous when /auth/me 401s', async () => {
    mockGet.mockRejectedValue(new Error('unauthorized'))
    mount()
    expect(screen.getByTestId('loading')).toHaveTextContent('loading')
    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('ready'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('anonymous')
  })

  it('hydrates the user when /auth/me succeeds', async () => {
    mockGet.mockResolvedValue(ME)
    mount()
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('admin@demo.test'),
    )
  })

  it('login POSTs creds, refetches /auth/me, and sets the user', async () => {
    mockGet.mockRejectedValueOnce(new Error('anonymous')) // initial /auth/me
    mockPost.mockResolvedValue({}) // /auth/login
    mockGet.mockResolvedValue(ME) // post-login /auth/me
    mount()
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('anonymous'),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        email: 'a@b.com',
        password: 'pw',
      }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('admin@demo.test'),
    )
  })

  it('logout POSTs /auth/logout and clears the user even if POST rejects', async () => {
    mockGet.mockResolvedValue(ME) // initial /auth/me → authed
    mockPost.mockRejectedValue(new Error('already out'))
    mount()
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('admin@demo.test'),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'logout' }))
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/auth/logout'),
    )
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('anonymous'),
    )
  })

  it('useAuth throws when used outside AuthProvider', () => {
    // Swallow React's error logging for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(
      /useAuth must be used within <AuthProvider>/,
    )
    spy.mockRestore()
  })
})
