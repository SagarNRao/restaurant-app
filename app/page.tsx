'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import ThemeToggle from '@/components/theme-toggle'
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !data.user) {
      setError(signInError?.message ?? 'Login failed')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      setError('Signed in, but no profile row was found for this user.')
      setLoading(false)
      return
    }

    router.push(`/${profile.role}`)
  }

  return (
    <main className="max-w-md mx-auto my-20 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm">Email</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div>
              <label className="block text-sm">Password</label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
            {error && <p className="text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Seed accounts (password: <code>password123</code>):
            <br />
            owner@demo.com
            <br />
            manager1@demo.com / manager2@demo.com
            <br />
            employee1@demo.com / employee2@demo.com / employee3@demo.com
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
