"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useRequireRole } from '@/lib/useRequireRole'
import type { Branch, Profile } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default function OwnerPage() {
  const router = useRouter()
  const { profile, loading } = useRequireRole('owner')
  const [branches, setBranches] = useState<Branch[]>([])
  const [team, setTeam] = useState<Profile[]>([])
  const [newBranchName, setNewBranchName] = useState('')

  useEffect(() => {
    if (profile) loadData(profile.id)
  }, [profile])

  async function loadData(ownerId: string) {
    const [{ data: branchData }, { data: teamData }] = await Promise.all([
      supabase.from('branches').select('*').eq('owner_id', ownerId),
      supabase.from('profiles').select('*').eq('owner_id', ownerId),
    ])
    setBranches(branchData ?? [])
    setTeam(teamData ?? [])
  }

  async function addBranch(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !newBranchName.trim()) return
    await supabase.from('branches').insert({ owner_id: profile.id, name: newBranchName.trim() })
    setNewBranchName('')
    loadData(profile.id)
  }

  async function changeRole(userId: string, role: string) {
    if (!profile) return
    await supabase.from('profiles').update({ role }).eq('id', userId).eq('owner_id', profile.id)
    loadData(profile.id)
  }

  async function changeBranch(userId: string, branchId: string) {
    if (!profile) return
    await supabase
      .from('profiles')
      .update({ branch_id: branchId || null })
      .eq('id', userId)
      .eq('owner_id', profile.id)
    loadData(profile.id)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return <p className="p-10">Loading...</p>

  return (
    <main className="max-w-4xl mx-auto my-10 px-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Owner Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <p>Welcome, {profile?.full_name}</p>
            <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Branches</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {branches.map((b) => (
                <li key={b.id}>
                  {b.name}
                  {b.location ? ` – ${b.location}` : ''}
                </li>
              ))}
            </ul>
            <form onSubmit={addBranch} className="mt-4 flex gap-2">
              <Input placeholder="New branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
              <Button type="submit">Add branch</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Change a person's role or branch below. Only the owner can do this.</p>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Branch</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {team.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell>
                      <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value)}>
                        <option value="manager">manager</option>
                        <option value="employee">employee</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <select value={member.branch_id ?? ''} onChange={(e) => changeBranch(member.id, e.target.value)}>
                        <option value="">—</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
