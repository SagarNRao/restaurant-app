"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useRequireRole } from '@/lib/useRequireRole'
import type { Attendance, LeaveRequest, Profile } from '@/lib/types'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table'

export default function ManagerPage() {
  const router = useRouter()
  const { profile, loading } = useRequireRole('manager')
  const [employees, setEmployees] = useState<Profile[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])

  useEffect(() => {
    if (profile) loadData(profile.id)
  }, [profile])

  async function loadData(managerId: string) {
    const [{ data: emp }, { data: leave }, { data: att }] = await Promise.all([
      supabase.from('profiles').select('*').eq('manager_id', managerId),
      supabase
        .from('leave_requests')
        .select('*')
        .eq('manager_id', managerId)
        .order('created_at', { ascending: false }),
      supabase.from('attendance').select('*').order('check_in', { ascending: false }).limit(20),
    ])
    setEmployees(emp ?? [])
    setLeaveRequests(leave ?? [])
    setAttendance(att ?? [])
  }

  async function decide(id: string, status: 'approved' | 'rejected') {
    if (!profile) return
    await supabase
      .from('leave_requests')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
    loadData(profile.id)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return <p className="p-10">Loading...</p>

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.full_name ?? id
  }

  return (
    <main className="max-w-3xl mx-auto my-10 px-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manager Dashboard</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={logout}>
              Log out
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Welcome, {profile?.full_name}</p>
        </CardContent>
      </Card>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>My employees</CardTitle>
            <CardDescription>People reporting to you</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {employees.map((e) => (
                <li key={e.id}>{e.full_name}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Leave requests</CardTitle>
            <CardDescription>Approve or reject pending requests</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {leaveRequests.map((lr) => (
                  <TableRow key={lr.id}>
                    <TableCell>{employeeName(lr.employee_id)}</TableCell>
                    <TableCell>
                      {lr.start_date} → {lr.end_date}
                    </TableCell>
                    <TableCell>{lr.reason}</TableCell>
                    <TableCell className="capitalize">{lr.status}</TableCell>
                    <TableCell>
                      {lr.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="default" onClick={() => decide(lr.id, 'approved')}>
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => decide(lr.id, 'rejected')}>
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Recent attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Employee</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {attendance.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{employeeName(a.employee_id)}</TableCell>
                    <TableCell>{new Date(a.check_in).toLocaleString()}</TableCell>
                    <TableCell>{a.check_out ? new Date(a.check_out).toLocaleString() : '—'}</TableCell>
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
