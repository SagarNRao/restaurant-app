import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { employeeId, managerId, period } = await request.json() // period: "2026-06"

    // 1. Fetch employee financial rates
    const { data: emp, error: empErr } = await supabaseAdmin
      .from('profiles')
      .select('hourly_rate, overtime_rate')
      .eq('id', employeeId)
      .single()

    if (empErr || !emp) return NextResponse.json({ error: 'Employee rates not found' }, { status: 400 })

    // 2. Fetch all completed attendance punch cards for this month
    const { data: attendance, error: attErr } = await supabaseAdmin
      .from('attendance')
      .select('check_in, check_out, status, overtime_minutes')
      .eq('employee_id', employeeId)
      .is('absent', false) // skip unpaid absences
      .not('check_out', 'is', null)

    if (attErr || !attendance) return NextResponse.json({ error: 'Attendance records missing' }, { status: 400 })

    // Filter down records strictly belonging to target month (e.g. "2026-06")
    const targetRecords = attendance.filter(a => a.check_in.startsWith(period))

    let totalBaseMinutes = 0
    let totalOvertimeMinutes = 0
    let lateCount = 0

    targetRecords.forEach(rec => {
      if (rec.status === 'late') lateCount++
      totalOvertimeMinutes += (rec.overtime_minutes || 0)

      // Calculate base hours worked
      const start = new Date(rec.check_in)
      const end = new Date(rec.check_out!)
      const totalDurationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000)
      
      // Keep base hours separate from tracked overtime
      const baseMinutes = Math.max(0, totalDurationMinutes - (rec.overtime_minutes || 0))
      totalBaseMinutes += baseMinutes
    })

    const baseHours = totalBaseMinutes / 60
    const overtimeHours = totalOvertimeMinutes / 60

    // 3. Apply Simple Rules Formula
    const grossEarnings = (baseHours * Number(emp.hourly_rate)) + (overtimeHours * Number(emp.overtime_rate))
    
    // Penalty: Deduct $10 flat rate for every instance of being late
    const lateDeductions = lateCount * 10 
    const netTakeHome = Math.max(0, grossEarnings - lateDeductions)

    // 4. Upsert into database slips index
    const { data: slip, error: slipErr } = await supabaseAdmin
      .from('pay_slips')
      .upsert({
        employee_id: employeeId,
        manager_id: managerId,
        pay_period: period,
        base_hours_worked: Number(baseHours.toFixed(2)),
        overtime_hours_worked: Number(overtimeHours.toFixed(2)),
        late_count: lateCount,
        earnings: Number(grossEarnings.toFixed(2)),
        deductions: Number(lateDeductions.toFixed(2)),
        net_take_home: Number(netTakeHome.toFixed(2)),
        status: 'paid'
      }, { onConflict: 'employee_id,pay_period' })
      .select()
      .single()

    if (slipErr) return NextResponse.json({ error: slipErr.message }, { status: 400 })
    return NextResponse.json({ success: true, slip })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}