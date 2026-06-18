"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/useRequireRole";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

interface ActiveAttendance {
  id: string;
  check_in: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

export default function EmployeePage() {
  const router = useRouter();
  // Protecting the page: ensures only employees can access it
  const { profile, loading } = useRequireRole("employee");

  const [activeAttendance, setActiveAttendance] =
    useState<ActiveAttendance | null>(null);
  const [fetchingStatus, setFetchingStatus] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      checkActiveSession(profile.id);
    }
  }, [profile]);

  // Checks if the user is currently clocked in for today
  async function checkActiveSession(employeeId: string) {
    setFetchingStatus(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("id, check_in, scheduled_start, scheduled_end, status")
      .eq("employee_id", employeeId)
      .is("check_out", null) // Look for an ongoing session where check_out hasn't happened
      .order("check_in", { ascending: false })
      .maybeSingle();

    if (!error && data) {
      setActiveAttendance(data);
    }
    setFetchingStatus(false);
  }

 async function handleCheckIn() {
  if (!profile) return
  setErrorMsg(null)

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0] // Returns "2026-06-18"

  // 1. Query today's assignment from shift_assignments, joining the shifts data
  const { data: assignment, error: assignmentErr } = await supabase
    .from('shift_assignments')
    .select(`
      id,
      date,
      shifts:shift_id (
        start_time,
        end_time
      )
    `)
    .eq('employee_id', profile.id)
    .eq('date', todayStr)
    .maybeSingle()

  // Debug log to see exactly what Supabase found
  console.log("Shift Assignment Found:", assignment)

  if (assignmentErr || !assignment || !assignment.shifts) {
    setErrorMsg("You don't have an assigned shift for today. Contact your manager.")
    return
  }

  // 2. Safely extract the shift times
  const shiftData = assignment.shifts as any
  
  // Create proper absolute timestamps combining today's date with the shift times
  const scheduledStart = new Date(`${todayStr}T${shiftData.start_time}`)
  const scheduledEnd = new Date(`${todayStr}T${shiftData.end_time}`)

  // 3. Late Detection (5 minute grace period)
  let finalStatus = 'present'
  const gracePeriodInMs = 5 * 60 * 1000 
  if (now.getTime() > (scheduledStart.getTime() + gracePeriodInMs)) {
    finalStatus = 'late'
  }

  // 4. Save to the attendance table
  const { data: newRecord, error: insertErr } = await supabase
    .from('attendance')
    .insert({
      employee_id: profile.id,
      branch_id: profile.branch_id, // Grabs the branch from the current active user profile
      check_in: now.toISOString(),
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      status: finalStatus
    })
    .select()
    .single()

  if (insertErr) {
    setErrorMsg(`Check-in failed: ${insertErr.message}`)
    console.error("Attendance Insert Error:", insertErr)
  } else {
    setActiveAttendance(newRecord)
  }
}
  async function handleCheckOut() {
    if (!activeAttendance || !profile) return;
    setErrorMsg(null);

    const now = new Date();
    const scheduledEnd = new Date(activeAttendance.scheduled_end);
    let overtimeMinutes = 0;

    // Calculate overtime minutes if they stay past their scheduled shift end
    if (now > scheduledEnd) {
      const diffInMs = now.getTime() - scheduledEnd.getTime();
      overtimeMinutes = Math.floor(diffInMs / 1000 / 60);
    }

    const { error: updateErr } = await supabase
      .from("attendance")
      .update({
        check_out: now.toISOString(),
        overtime_minutes: overtimeMinutes,
      })
      .eq("id", activeAttendance.id);

    if (updateErr) {
      setErrorMsg(`Check-out failed: ${updateErr.message}`);
    } else {
      setActiveAttendance(null);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading || fetchingStatus) return <p className="p-10">Loading...</p>;

  return (
    <main className="max-w-md mx-auto my-10 px-4 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Welcome, {profile?.full_name}</CardTitle>
            <CardDescription>Employee Dashboard</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Log out
          </Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {errorMsg && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {errorMsg}
            </div>
          )}

          {!activeAttendance ? (
            <div className="text-center space-y-4 py-6">
              <p className="text-sm text-muted-foreground">
                You are currently clocked out.
              </p>
              <Button size="lg" className="w-full" onClick={handleCheckIn}>
                Clock In
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clocked in at:</span>
                  <span className="font-medium">
                    {new Date(activeAttendance.check_in).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shift Target:</span>
                  <span className="font-medium">
                    {new Date(
                      activeAttendance.scheduled_start,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -
                    {new Date(
                      activeAttendance.scheduled_end,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={`font-semibold capitalize ${activeAttendance.status === "late" ? "text-destructive" : "text-emerald-600"}`}
                  >
                    {activeAttendance.status}
                  </span>
                </div>
              </div>

              <Button
                size="lg"
                variant="destructive"
                className="w-full"
                onClick={handleCheckOut}
              >
                Clock Out
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
