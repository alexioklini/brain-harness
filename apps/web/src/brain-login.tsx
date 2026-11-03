/** Pre-session login using the shared Harness controls and theme. @module */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/base.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/design-platform.css'
import '@deepseek-ai/dsh-client-ui-theme/src/styles/focus.css'
import { brainLoginLocales } from './brain-login-locales.ts'
import '@deepseek-ai/dsh-client-web/src/base.css'
import css from './brain-login.module.css'

const locale = navigator.language.startsWith('de') ? 'de' : 'en'
const copy = brainLoginLocales[locale]
document.documentElement.lang = locale

function BrainLogin() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <main className={css.root}><form onSubmit={(event) => { void (async () => {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const data = new FormData(form)
    setPending(true)
    setError('')
    try {
      const response = await fetch('/_brain/login', { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) })
      form.reset()
      if (!response.ok) { setError(response.status === 401 || response.status === 403 ? copy.invalid : copy.unavailable); return }
      window.location.replace('/')
    } catch { setError(copy.unavailable) }
    finally { setPending(false) }
  })() }}>
    <h1>{copy.title}</h1>
    <label>{copy.username}<Input name="username" autoComplete="username" required disabled={pending} /></label>
    <label>{copy.password}<Input name="password" type="password" autoComplete="current-password" required disabled={pending} /></label>
    {error && <p role="alert">{error}</p>}
    <Button variant="primary" type="submit" disabled={pending}>{pending ? copy.pending : copy.submit}</Button>
  </form></main>
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<BrainLogin />)
