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
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface ActiveAttendance {
  id: string;
  check_in: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

interface LeaveHistoryItem {
  id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
}

export default function EmployeePage() {
  const router = useRouter();
  const { profile, loading } = useRequireRole("employee");

  const [activeAttendance, setActiveAttendance] =
    useState<ActiveAttendance | null>(null);
  const [fetchingStatus, setFetchingStatus] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaveStatusMsg, setLeaveStatusMsg] = useState<string | null>(null);

  // New state for showing request tracking history
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistoryItem[]>([]);

  useEffect(() => {
    if (profile) {
      checkActiveSession(profile.id);
      loadLeaveHistory(profile.id);
    }
  }, [profile]);

  async function checkActiveSession(employeeId: string) {
    setFetchingStatus(true);
    const { data, error } = await supabase
      .from("attendance")
      .select("id, check_in, scheduled_start, scheduled_end, status")
      .eq("employee_id", employeeId)
      .is("check_out", null)
      .order("check_in", { ascending: false })
      .maybeSingle();

    if (!error && data) {
      setActiveAttendance(data);
    }
    setFetchingStatus(false);
  }

  // Fetch all leaves applied by this specific user
  async function loadLeaveHistory(employeeId: string) {
    const { data, error } = await supabase
      .from("leave_requests")
      .select("id, start_date, end_date, reason, status")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setLeaveHistory(data);
    }
  }

  async function handleCheckIn() {
    if (!profile) return;
    setErrorMsg(null);

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    const { data: assignment, error: assignmentErr } = await supabase
      .from("shift_assignments")
      .select(`
        id,
        date,
        shifts:shift_id (
          start_time,
          end_time
        )
      `)
      .eq("employee_id", profile.id)
      .eq("date", todayStr)
      .maybeSingle();

    if (assignmentErr || !assignment || !assignment.shifts) {
      setErrorMsg("You don't have an assigned shift for today. Contact your manager.");
      return;
    }

    const shiftData = assignment.shifts as any;
    const scheduledStart = new Date(`${todayStr}T${shiftData.start_time}`);
    const scheduledEnd = new Date(`${todayStr}T${shiftData.end_time}`);

    let finalStatus = "present";
    const gracePeriodInMs = 5 * 60 * 1000;
    if (now.getTime() > scheduledStart.getTime() + gracePeriodInMs) {
      finalStatus = "late";
    }

    const { data: newRecord, error: insertErr } = await supabase
      .from("attendance")
      .insert({
        employee_id: profile.id,
        branch_id: profile.branch_id,
        check_in: now.toISOString(),
        scheduled_start: scheduledStart.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
        status: finalStatus,
      })
      .select()
      .single();

    if (insertErr) {
      setErrorMsg(`Check-in failed: ${insertErr.message}`);
    } else {
      setActiveAttendance(newRecord);
    }
  }

  async function handleCheckOut() {
    if (!activeAttendance || !profile) return;
    setErrorMsg(null);

    const now = new Date();
    const scheduledEnd = new Date(activeAttendance.scheduled_end);
    let overtimeMinutes = 0;

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

  async function handleApplyLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setLeaveStatusMsg(null);

    if (!profile.manager_id) {
      setLeaveStatusMsg("Error: You do not have an assigned manager to route this request to.");
      return;
    }

    const { error } = await supabase.from("leave_requests").insert({
      employee_id: profile.id,
      manager_id: profile.manager_id,
      start_date: startDate,
      end_date: endDate,
      reason: reason,
      status: "pending",
    });

    if (error) {
      setLeaveStatusMsg(`Submission failed: ${error.message}`);
    } else {
      setLeaveStatusMsg("Leave request submitted successfully!");
      setStartDate("");
      setEndDate("");
      setReason("");
      loadLeaveHistory(profile.id); // Refresh history layout
      setTimeout(() => setLeaveStatusMsg(null), 4000);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading || fetchingStatus) return <p className="p-10">Loading...</p>;

  return (
    <main className="max-w-md mx-auto my-10 px-4 space-y-6">
      {/* Attendance Controller */}
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
                    {new Date(activeAttendance.scheduled_start).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    -{" "}
                    {new Date(activeAttendance.scheduled_end).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={`font-semibold capitalize ${
                      activeAttendance.status === "late"
                        ? "text-destructive"
                        : "text-emerald-600"
                    }`}
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

      {/* Leave Application Module */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for Leave</CardTitle>
          <CardDescription>Submit a date range request for manager approval</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyLeave} className="space-y-4">
            {leaveStatusMsg && (
              <div className={`text-sm p-3 rounded-md ${
                leaveStatusMsg.includes("successfully") 
                  ? "bg-emerald-100 text-emerald-800" 
                  : "bg-destructive/10 text-destructive"
              }`}>
                {leaveStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold">Reason</label>
              <textarea
                placeholder="State your reason..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border p-2 rounded text-sm bg-background text-foreground min-h-[80px]"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Submit Request
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* NEW: Leave Tracker Board */}
      <Card>
        <CardHeader>
          <CardTitle>My Leave Requests</CardTitle>
          <CardDescription>Track approval tracking states</CardDescription>
        </CardHeader>
        <CardContent>
          {leaveHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No leave requests found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaveHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{item.start_date} → {item.end_date}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{item.reason}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        item.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                        item.status === 'rejected' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}