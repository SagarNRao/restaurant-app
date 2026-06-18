'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import type { Profile, UserRole } from '@/lib/types'

// Loads the current user's profile and redirects away if they aren't
// signed in or don't have the right role. Plain client-side check —
// no middleware, just a hook each role page calls on mount.
export function useRequireRole(role: UserRole) {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        router.replace('/')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (!active) return

      if (error || !data) {
        router.replace('/')
        return
      }

      const loadedProfile = data as Profile

      if (loadedProfile.role !== role) {
        router.replace(`/${loadedProfile.role}`)
        return
      }

      setProfile(loadedProfile)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [role, router])

  return { profile, loading }
}
