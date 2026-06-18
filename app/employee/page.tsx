"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useRequireRole } from '@/lib/useRequireRole'
import type { Attendance, LeaveRequest } from '@/lib/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export default function EmployeePage() {
  const router = useRouter()
  const { profile, loading } = useRequireRole('employee')
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [openShift, setOpenShift] = useState<Attendance | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (profile) loadData(profile.id)
  }, [profile])

  async function loadData(employeeId: string) {
    const [{ data: att }, { data: leave }] = await Promise.all([
      supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', employeeId)
        .order('check_in', { ascending: false }),
      supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false }),
    ])
    setAttendance(att ?? [])
    setLeaveRequests(leave ?? [])
    setOpenShift((att ?? []).find((a) => !a.check_out) ?? null)
  }

  async function checkIn() {
    if (!profile) return
    await supabase.from('attendance').insert({ employee_id: profile.id, branch_id: profile.branch_id })
    loadData(profile.id)
  }

  async function checkOut() {
    if (!profile || !openShift) return
    await supabase
      .from('attendance')
      .update({ check_out: new Date().toISOString() })
      .eq('id', openShift.id)
    loadData(profile.id)
  }

  async function applyLeave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    await supabase.from('leave_requests').insert({
      employee_id: profile.id,
      manager_id: profile.manager_id,
      start_date: startDate,
      end_date: endDate,
      reason,
    })
    setStartDate('')
    setEndDate('')
    setReason('')
    loadData(profile.id)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return <p className="p-10">Loading...</p>

  return (
    <main className="max-w-3xl mx-auto my-10 px-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Employee Dashboard</CardTitle>
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
            <CardTitle>Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              {openShift ? (
                <Button onClick={checkOut} variant="destructive">Check out</Button>
              ) : (
                <Button onClick={checkIn}>Check in</Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {attendance.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{new Date(a.check_in).toLocaleString()}</TableCell>
                    <TableCell>{a.check_out ? new Date(a.check_out).toLocaleString() : '—'}</TableCell>
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
            <CardTitle>Apply for leave</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={applyLeave} className="flex flex-col gap-3">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button type="submit">Apply</Button>
            </form>

            <h3 className="mt-4">My leave requests</h3>
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Dates</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {leaveRequests.map((lr) => (
                  <TableRow key={lr.id}>
                    <TableCell>{lr.start_date} → {lr.end_date}</TableCell>
                    <TableCell>{lr.reason}</TableCell>
                    <TableCell className="capitalize">{lr.status}</TableCell>
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
