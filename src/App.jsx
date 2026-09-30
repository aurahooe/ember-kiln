import { useEffect, useMemo, useState } from 'react'
import { supabase, hourKey, nextHour } from './lib/supabase'

const FALLBACKS = [
  { headline: 'The kiln is warm.', blurb: 'Nothing public has been pulled from the shelf this hour. Leave a slip in the desk. If you mark it public, it can sit in the window next time the hour turns.' },
  { headline: 'Clay under the nails.', blurb: 'This hour has no featured slip yet. Public work from signed-in makers is what gets lifted into the window when the clock rolls.' },
]

function useTick() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

export default function App() {
  const now = useTick()
  const key = hourKey(now)
  const [session, setSession] = useState(null)
  const [profileEmail, setProfileEmail] = useState('')
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMsg, setAuthMsg] = useState('')
  const [edition, setEdition] = useState(null)
  const [featured, setFeatured] = useState(null)
  const [publicWorks, setPublicWorks] = useState([])
  const [mine, setMine] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('floor')
  const [toast, setToast] = useState('')

  const remain = useMemo(() => {
    const t = nextHour() - now
    const s = Math.max(0, Math.floor(t / 1000))
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(s % 60).padStart(2, '0')
    return `${mm}:${ss}`
  }, [now])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setProfileEmail(data.session?.user?.email || '')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setProfileEmail(s?.user?.email || '')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function loadPublic() {
    const { data: hours } = await supabase.from('kiln_hours').select('*').eq('hour_key', key).maybeSingle()
    setEdition(hours)
    if (hours?.work_id) {
      const { data: w } = await supabase.from('kiln_works').select('*').eq('id', hours.work_id).maybeSingle()
      setFeatured(w)
    } else setFeatured(null)
    const { data: works } = await supabase.from('kiln_works').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(24)
    setPublicWorks(works || [])
  }

  async function loadMine(userId) {
    const { data } = await supabase.from('kiln_works').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setMine(data || [])
  }

  useEffect(() => { loadPublic() }, [key])
  useEffect(() => { if (session?.user?.id) loadMine(session.user.id); else setMine([]) }, [session])

  function flash(t) { setToast(t); setTimeout(() => setToast(''), 2800) }

  async function submitAuth(e) {
    e.preventDefault()
    setAuthMsg('')
    if (authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setAuthMsg(error.message)
      else { setView('desk'); flash('You are in.') }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setAuthMsg(error.message)
      else setAuthMsg('Account created. If email confirm is on, check your inbox; otherwise sign in.')
    }
  }

  async function saveWork(e) {
    e.preventDefault()
    if (!session) return setView('gate')
    setSaving(true)
    const { error } = await supabase.from('kiln_works').insert({ user_id: session.user.id, title: title.trim(), body: body.trim(), is_public: isPublic })
    setSaving(false)
    if (error) return flash(error.message)
    setTitle(''); setBody('')
    flash(isPublic ? 'On the floor. Anyone can read it.' : 'Filed in your desk.')
    loadPublic(); loadMine(session.user.id)
  }

  async function togglePublic(w) {
    const { error } = await supabase.from('kiln_works').update({ is_public: !w.is_public }).eq('id', w.id)
    if (error) return flash(error.message)
    loadPublic(); loadMine(session.user.id)
  }

  async function removeWork(w) {
    const { error } = await supabase.from('kiln_works').delete().eq('id', w.id)
    if (error) return flash(error.message)
    loadPublic(); loadMine(session.user.id)
  }

  const fallback = FALLBACKS[now.getUTCHours() % FALLBACKS.length]
  const hero = edition || fallback

  return (
    <div className="wrap">
      <div className="grain" aria-hidden="true" />
      <header className="top">
        <button className="mark" onClick={() => setView('floor')}><span className="ember" />Ember Kiln</button>
        <nav>
          <button className={view === 'floor' ? 'on' : ''} onClick={() => setView('floor')}>Floor</button>
          <button className={view === 'desk' ? 'on' : ''} onClick={() => setView(session ? 'desk' : 'gate')}>Desk</button>
          {session ? (
            <button onClick={() => supabase.auth.signOut()}>Sign out</button>
          ) : (
            <button className={view === 'gate' ? 'on' : ''} onClick={() => setView('gate')}>Sign in</button>
          )}
        </nav>
      </header>
      <section className="hourband">
        <div>
          <p className="kicker">Hour {key.replace('T', ' · ')} UTC</p>
          <h1 className="rise">{hero.headline}</h1>
          <p className="lede">{hero.blurb}</p>
        </div>
        <div className="clock"><span>Next firing</span><strong>{remain}</strong></div>
      </section>
      {featured && (
        <article className="feature card rise-delay">
          <p className="kicker">In the window</p>
          <h2>{featured.title}</h2>
          <p className="body">{featured.body}</p>
        </article>
      )}
      {view === 'floor' && (
        <section className="grid">
          {publicWorks.length === 0 && <p className="empty">The floor is empty. Sign in, write something, mark it public.</p>}
          {publicWorks.map((w, i) => (
            <article className="card slip" key={w.id} style={{ animationDelay: `${0.04 * i}s` }}>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
              <time>{new Date(w.created_at).toLocaleString()}</time>
            </article>
          ))}
        </section>
      )}
      {view === 'gate' && (
        <section className="panel rise">
          <h2>{authMode === 'signin' ? 'Come back to the desk' : 'Take a key'}</h2>
          <p className="muted">Email and password. Sessions persist in this browser.</p>
          <form onSubmit={submitAuth} className="stack">
            <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} /></label>
            {authMsg && <p className="err">{authMsg}</p>}
            <button className="primary" type="submit">{authMode === 'signin' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="link" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>
            {authMode === 'signin' ? 'Need an account?' : 'Already have one?'}
          </button>
        </section>
      )}
      {view === 'desk' && session && (
        <section className="desk">
          <p className="muted">Signed in as {profileEmail}</p>
          <form onSubmit={saveWork} className="panel stack">
            <h2>New slip</h2>
            <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={140} /></label>
            <label>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={8000} rows={8} /></label>
            <label className="check">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Mark public — it will show on the floor
            </label>
            <button className="primary" disabled={saving}>{saving ? 'Firing…' : 'Save slip'}</button>
          </form>
          <div className="mine">
            {mine.map((w) => (
              <article className="card" key={w.id}>
                <header>
                  <h3>{w.title}</h3>
                  <span className={w.is_public ? 'tag pub' : 'tag'}>{w.is_public ? 'public' : 'desk'}</span>
                </header>
                <p>{w.body}</p>
                <div className="row">
                  <button onClick={() => togglePublic(w)}>{w.is_public ? 'Pull from floor' : 'Put on floor'}</button>
                  <button className="danger" onClick={() => removeWork(w)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {toast && <div className="toast">{toast}</div>}
      <footer><p>Ember Kiln · a new window every hour · public slips stay on the floor</p></footer>
    </div>
  )
}
