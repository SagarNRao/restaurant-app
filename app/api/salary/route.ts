import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { employeeId, managerId, period } = await request.json() // period: "2026-06"

    // 1. Fetch employee financial configurations
    const { data: emp, error: empErr } = await supabaseAdmin
      .from('profiles')
      .select('hourly_rate, overtime_rate')
      .eq('id', employeeId)
      .single()

    if (empErr || !emp) return NextResponse.json({ error: 'Employee rates not found' }, { status: 400 })

    // 2. Fetch ALL attendance cards for this month (including ones currently clocked in)
    const { data: attendance, error: attErr } = await supabaseAdmin
      .from('attendance')
      .select('check_in, check_out, status, overtime_minutes, scheduled_end')
      .eq('employee_id', employeeId)

    if (attErr || !attendance) {
      return NextResponse.json({ error: 'Database access failure' }, { status: 500 })
    }

    // Filter down records strictly belonging to the target month prefix
    const targetRecords = attendance.filter(a => a.check_in && a.check_in.startsWith(period))

    // FIX: If they don't have a single clock-in row yet for this month, don't crash. Return zero balances.
    if (targetRecords.length === 0) {
      return NextResponse.json({
        success: true,
        slip: {
          pay_period: period,
          base_hours_worked: 0,
          overtime_hours_worked: 0,
          late_count: 0,
          earnings: 0,
          deductions: 0,
          net_take_home: 0,
          status: 'unpaid'
        }
      })
    }

    let totalBaseMinutes = 0
    let totalOvertimeMinutes = 0
    let lateCount = 0

    const now = new Date()

    targetRecords.forEach(rec => {
      if (rec.status === 'late') lateCount++

      // Determine accurate calculation boundaries
      const start = new Date(rec.check_in)
      
      // FIX: If they are actively clocked in right now, compute hours accumulated up to this exact second
      const end = rec.check_out ? new Date(rec.check_out) : now
      
      const totalDurationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000)

      let currentOvertime = 0
      if (rec.check_out) {
        // Use explicitly recorded overtime minutes from finished shifts
        currentOvertime = rec.overtime_minutes || 0
      } else if (rec.scheduled_end) {
        // Live shift tracking: if they exceeded their schedule right now, accumulate live overtime minutes
        const schedEnd = new Date(rec.scheduled_end)
        if (now > schedEnd) {
          currentOvertime = Math.floor((now.getTime() - schedEnd.getTime()) / 60000)
        }
      }

      totalOvertimeMinutes += currentOvertime
      
      // Base hours are total minutes minus calculated overtime minutes
      const baseMinutes = Math.max(0, totalDurationMinutes - currentOvertime)
      totalBaseMinutes += baseMinutes
    })

    const baseHours = totalBaseMinutes / 60
    const overtimeHours = totalOvertimeMinutes / 60

    // 3. Mathematical execution rules
    const grossEarnings = (baseHours * Number(emp.hourly_rate)) + (overtimeHours * Number(emp.overtime_rate))
    const lateDeductions = lateCount * 10 
    const netTakeHome = Math.max(0, grossEarnings - lateDeductions)

    // 4. Save/update pay slip register status
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