// Seeds demo accounts so you can log into each role.
// Run with: npm run seed   (reads .env.local)
//
// Creates:
//   owner@demo.com     (owner)
//   manager1@demo.com  (manager, Downtown branch)
//   manager2@demo.com  (manager, Uptown branch)
//   employee1@demo.com (employee, reports to manager1)
//   employee2@demo.com (employee, reports to manager1)
//   employee3@demo.com (employee, reports to manager2)
// Password for all: password123

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  console.error('Make sure .env.local is filled in before running `npm run seed`.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'password123'

async function getOrCreateUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })

  if (!error) return data.user

  if (error.message?.toLowerCase().includes('already')) {
    const { data: list, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw listError
    const existing = list.users.find((u) => u.email === email)
    if (existing) return existing
  }

  throw error
}

async function main() {
  console.log('Creating auth users...')
  const owner = await getOrCreateUser('owner@demo.com')
  const manager1 = await getOrCreateUser('manager1@demo.com')
  const manager2 = await getOrCreateUser('manager2@demo.com')
  const employee1 = await getOrCreateUser('employee1@demo.com')
  const employee2 = await getOrCreateUser('employee2@demo.com')
  const employee3 = await getOrCreateUser('employee3@demo.com')

  console.log('Creating branches...')
  // Clear out any previous demo branches for this owner so re-running is idempotent.
  await admin.from('branches').delete().eq('owner_id', owner.id)

  const { data: branches, error: branchError } = await admin
    .from('branches')
    .insert([
      { owner_id: owner.id, name: 'Downtown Branch', location: 'Main Street' },
      { owner_id: owner.id, name: 'Uptown Branch', location: 'North Avenue' },
    ])
    .select()

  if (branchError) throw branchError
  const [branch1, branch2] = branches

  console.log('Creating profiles...')
  const profiles = [
    { id: owner.id, full_name: 'Olivia Owner', role: 'owner', owner_id: null, manager_id: null, branch_id: null },
    { id: manager1.id, full_name: 'Mark Manager', role: 'manager', owner_id: owner.id, manager_id: null, branch_id: branch1.id },
    { id: manager2.id, full_name: 'Maya Manager', role: 'manager', owner_id: owner.id, manager_id: null, branch_id: branch2.id },
    { id: employee1.id, full_name: 'Eve Employee', role: 'employee', owner_id: owner.id, manager_id: manager1.id, branch_id: branch1.id },
    { id: employee2.id, full_name: 'Eli Employee', role: 'employee', owner_id: owner.id, manager_id: manager1.id, branch_id: branch1.id },
    { id: employee3.id, full_name: 'Ezra Employee', role: 'employee', owner_id: owner.id, manager_id: manager2.id, branch_id: branch2.id },
  ]

  const { error: profileError } = await admin.from('profiles').upsert(profiles)
  if (profileError) throw profileError

  console.log('Creating sample attendance...')
  await admin.from('attendance').delete().in('employee_id', [employee1.id, employee2.id])
  await admin.from('attendance').insert([
    {
      employee_id: employee1.id,
      branch_id: branch1.id,
      check_in: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      check_out: new Date().toISOString(),
    },
    {
      employee_id: employee2.id,
      branch_id: branch1.id,
      check_in: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      check_out: null,
    },
  ])

  console.log('Creating sample leave request...')
  await admin.from('leave_requests').delete().eq('employee_id', employee3.id)
  await admin.from('leave_requests').insert([
    {
      employee_id: employee3.id,
      manager_id: manager2.id,
      start_date: '2026-06-25',
      end_date: '2026-06-27',
      reason: 'Family event',
      status: 'pending',
    },
  ])

  console.log('\nDone! Seed accounts (password: password123):')
  console.log('  owner@demo.com')
  console.log('  manager1@demo.com   (Downtown)')
  console.log('  manager2@demo.com   (Uptown)')
  console.log('  employee1@demo.com  (reports to manager1)')
  console.log('  employee2@demo.com  (reports to manager1, currently checked in)')
  console.log('  employee3@demo.com  (reports to manager2, has a pending leave request)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
