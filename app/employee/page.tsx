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

  // Form states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [leaveStatusMsg, setLeaveStatusMsg] = useState<string | null>(null);
  const [leaveHistory, setLeaveHistory] = useState<LeaveHistoryItem[]>([]);

  // 1. Add these states inside EmployeePage component:
  const [otDate, setOtDate] = useState("");
  const [otMinutes, setOtMinutes] = useState("");
  const [otReason, setOtReason] = useState("");
  const [otStatusMsg, setOtStatusMsg] = useState<string | null>(null);
  const [otHistory, setOtHistory] = useState<any[]>([]);

  // 2. Load overtime history in useEffect
  async function loadOvertimeHistory(employeeId: string) {
    const { data } = await supabase
      .from("overtime_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    if (data) setOtHistory(data);
  }

  // 3. Form Submission handler
  async function handleApplyOvertime(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.manager_id) return;
    setOtStatusMsg(null);

    const { error } = await supabase.from("overtime_requests").insert({
      employee_id: profile.id,
      manager_id: profile.manager_id,
      date: otDate,
      minutes_requested: parseInt(otMinutes, 10),
      reason: otReason,
    });

    if (error) {
      setOtStatusMsg(`Failed: ${error.message}`);
    } else {
      setOtStatusMsg("Overtime request submitted!");
      setOtDate("");
      setOtMinutes("");
      setOtReason("");
      loadOvertimeHistory(profile.id);
    }
  }

  useEffect(() => {
    if (profile) {
      loadLeaveHistory(profile.id);
    }
  }, [profile]);

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

  async function handleApplyLeave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setLeaveStatusMsg(null);

    if (!profile.manager_id) {
      setLeaveStatusMsg(
        "Error: You do not have an assigned manager to route this request to.",
      );
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
      loadLeaveHistory(profile.id);
      setTimeout(() => setLeaveStatusMsg(null), 4000);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) return <p className="p-10">Loading...</p>;

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
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Attendance management is restricted to your branch manager. Contact
            your supervisor to report schedule adjustments or check-ins.
          </p>
        </CardContent>
      </Card>

      {/* Leave Application Module */}
      <Card>
        <CardHeader>
          <CardTitle>Apply for Leave</CardTitle>
          <CardDescription>
            Submit a date range request for manager approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyLeave} className="space-y-4">
            {leaveStatusMsg && (
              <div
                className={`text-sm p-3 rounded-md ${
                  leaveStatusMsg.includes("successfully")
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
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
      {/* Overtime Request Card */}
      <Card>
        <CardHeader>
          <CardTitle>Claim Overtime Hours</CardTitle>
          <CardDescription>
            Submit extra operational minutes for approval.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyOvertime} className="space-y-4">
            {otStatusMsg && (
              <div className="text-sm p-2 bg-muted rounded">{otStatusMsg}</div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold block mb-1">Date</label>
                <input
                  type="date"
                  value={otDate}
                  onChange={(e) => setOtDate(e.target.value)}
                  className="w-full border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">
                  Minutes Work
                </label>
                <input
                  type="number"
                  placeholder="e.g. 60"
                  value={otMinutes}
                  onChange={(e) => setOtMinutes(e.target.value)}
                  className="w-full border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">
                Reason/Task Completed
              </label>
              <textarea
                placeholder="Extended support shift, closing duties..."
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
                className="w-full border p-2 rounded text-sm bg-background text-foreground min-h-[60px]"
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Submit Overtime Claim
            </Button>
          </form>
        </CardContent>
      </Card>
      {/* Leave Tracker Board */}
      <Card>
        <CardHeader>
          <CardTitle>My Leave Requests</CardTitle>
          <CardDescription>Track approval tracking states</CardDescription>
        </CardHeader>
        <CardContent>
          {leaveHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No leave requests found.
            </p>
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
                      <div className="font-medium">
                        {item.start_date} → {item.end_date}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {item.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                          item.status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "rejected"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
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
