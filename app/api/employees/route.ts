import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 1. Initialize an admin client using the Service Role Key (Keep this secret, server-side only)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, fullName, managerId, branchId, ownerId } = body

    if (!email || !password || !fullName || !managerId || !branchId || !ownerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 2. Create the user inside Supabase Auth
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Bypass verification step for immediate use
      user_metadata: { full_name: fullName }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authUser.user?.id

    if (!userId) {
      return NextResponse.json({ error: 'Failed to create user object' }, { status: 500 })
    }

    // 3. Insert the profile directly into your custom database profiles table
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        full_name: fullName,
        role: 'employee',
        manager_id: managerId,
        branch_id: branchId,
        owner_id: ownerId
      })

    if (profileError) {
      // Cleanup: Delete auth user if profile writing fails to avoid dangling accounts
      await supabaseAdmin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, employeeId: userId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}