"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/useRequireRole";
import type { Attendance, LeaveRequest, Profile } from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

export default function ManagerPage() {
  const router = useRouter();

  const [activeCalendarDate, setActiveCalendarDate] = useState<Date>(
    new Date(),
  );
  const [calendarDayAttendance, setCalendarDayAttendance] = useState<any[]>([]);
  const [overrideStatusMsg, setOverrideStatusMsg] = useState<string | null>(
    null,
  );

  const [empEmail, setEmpEmail] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empFullName, setEmpFullName] = useState("");
  const [addEmpStatusMsg, setAddEmpStatusMsg] = useState<string | null>(null);

  const { profile, loading } = useRequireRole("manager");

  const [roster, setRoster] = useState<any[]>([]);
  const [newShiftName, setNewShiftName] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);

  // New states for arbitrary date attendance logging
  const [attTargetEmployee, setAttTargetEmployee] = useState("");
  const [attTargetDate, setAttTargetDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [attTargetStatus, setAttTargetStatus] = useState<
    "present" | "late" | "absent"
  >("present");
  const [attStatusMsg, setAttStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) loadData(profile.id, profile.branch_id);
  }, [profile]);

  // Helper to look up an employee's status for the dynamically selected date
  function getStatusForDate(employeeId: string, targetDate: Date) {
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    // 1. Look into the preloaded roster data first
    const match = roster.find(
      (r) => r.employee_id === employeeId && r.roster_date === dateStr,
    );
    if (match) return match.final_status;

    // 2. If it's not found in the limited roster view, let the UI render "Absent"
    // but we can ensure our upsert logic overwrites it cleanly.
    return "absent";
  }

  // Handler that creates or updates the attendance record for the specific calendar day
  async function handleStatusOverride(
    employeeId: string,
    targetDate: Date,
    newStatus: "present" | "late" | "absent",
  ) {
    if (!profile) return;
    setOverrideStatusMsg(null);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const day = String(targetDate.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const scheduledStart = new Date(`${dateStr}T09:00:00`);
    const scheduledEnd = new Date(`${dateStr}T17:00:00`);

    const checkInTime =
      newStatus === "absent" ? null : scheduledStart.toISOString();
    const checkOutTime =
      newStatus === "absent" ? null : scheduledEnd.toISOString();

    // Step 1: Delete any existing attendance record for this employee on this exact day to prevent duplicates
    await supabase
      .from("attendance")
      .delete()
      .eq("employee_id", employeeId)
      .gte("check_in", `${dateStr}T00:00:00`)
      .lte("check_in", `${dateStr}T23:59:59`);

    // Step 2: Insert the clean override record
    const { error } = await supabase.from("attendance").insert({
      employee_id: employeeId,
      branch_id: profile.branch_id,
      check_in: checkInTime,
      check_out: checkOutTime,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      status: newStatus,
    });

    if (error) {
      setOverrideStatusMsg(`Failed to save: ${error.message}`);
    } else {
      setOverrideStatusMsg("Attendance updated successfully!");
      // Refresh the component state data[cite: 1]
      loadData(profile.id, profile.branch_id);
      setTimeout(() => setOverrideStatusMsg(null), 3000);
    }
  }

  async function loadData(managerId: string, branchId: string | null) {
    let shiftTemplates: ShiftTemplate[] = [];
    if (branchId) {
      const { data: sData } = await supabase
        .from("shifts")
        .select("id, name, start_time, end_time")
        .eq("branch_id", branchId);
      shiftTemplates = sData ?? [];
    }

    const [{ data: emp }, { data: leave }, { data: rosterData }] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("manager_id", managerId),
        supabase
          .from("leave_requests")
          .select("*")
          .eq("manager_id", managerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_roster_status")
          .select("*")
          .order("roster_date", { ascending: false })
          .limit(200),
      ]);

    setShifts(shiftTemplates);
    setEmployees(emp ?? []);
    setLeaveRequests(leave ?? []);
    setRoster(rosterData ?? []);
  }

  // Allow the manager to force log an employee check-in manually
  // Allow the manager to log attendance for the specific date of the roster row

  async function handleExplicitMarkAttendance(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !attTargetEmployee) return;
    setAttStatusMsg(null);

    // Fallback default standard shift times if no custom template is linked on the fly
    const scheduledStart = new Date(`${attTargetDate}T09:00:00`);
    const scheduledEnd = new Date(`${attTargetDate}T17:00:00`);

    const checkInTime =
      attTargetStatus === "absent" ? null : scheduledStart.toISOString();
    const checkOutTime =
      attTargetStatus === "absent" ? null : scheduledEnd.toISOString();

    const { error } = await supabase.from("attendance").insert({
      employee_id: attTargetEmployee,
      branch_id: profile.branch_id,
      check_in: checkInTime,
      check_out: checkOutTime,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      status: attTargetStatus,
    });

    if (error) {
      setAttStatusMsg(`Error: ${error.message}`);
    } else {
      setAttStatusMsg("Attendance record saved successfully!");
      setAttTargetEmployee("");
      loadData(profile.id, profile.branch_id); // Refresh data view
      setTimeout(() => setAttStatusMsg(null), 3000);
    }
  }

  async function handleManagerMarkAttendance(
    row: any,
    statusOverride: "present" | "late" | "absent",
  ) {
    if (!profile) return;

    const targetDate = row.roster_date; // e.g., "2026-07-01"

    // Construct the scheduled range using the assigned shift's hours or fallbacks
    const scheduledStart = new Date(
      `${targetDate}T${row.shift_start_time || "09:00:00"}`,
    );
    const scheduledEnd = new Date(
      `${targetDate}T${row.shift_end_time || "17:00:00"}`,
    );

    // If marking absent, check_in and check_out can remain null, or match schedule
    const checkInTime =
      statusOverride === "absent" ? null : scheduledStart.toISOString();
    const checkOutTime =
      statusOverride === "absent" ? null : scheduledEnd.toISOString();

    const { error } = await supabase.from("attendance").insert({
      employee_id: row.employee_id,
      branch_id: profile.branch_id,
      check_in: checkInTime,
      check_out: checkOutTime,
      scheduled_start: scheduledStart.toISOString(),
      scheduled_end: scheduledEnd.toISOString(),
      status: statusOverride,
    });

    if (error) {
      alert(`Failed to log attendance: ${error.message}`);
    } else {
      // Refresh state to update the UI grid instantly
      loadData(profile.id, profile.branch_id);
    }
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.branch_id || !newShiftName) return;

    const { error } = await supabase.from("shifts").insert({
      branch_id: profile.branch_id,
      name: newShiftName,
      start_time: `${startTime}:00`,
      end_time: `${endTime}:00`,
    });

    if (error) {
      alert(`Failed to create shift: ${error.message}`);
    } else {
      setNewShiftName("");
      loadData(profile.id, profile.branch_id);
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setAddEmpStatusMsg(null);

    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: empEmail,
        password: empPassword,
        fullName: empFullName,
        managerId: profile.id,
        branchId: profile.branch_id,
        ownerId: profile.owner_id,
      }),
    });

    const resData = await response.json();

    if (!response.ok) {
      setAddEmpStatusMsg(`Error: ${resData.error}`);
    } else {
      setAddEmpStatusMsg("Employee created successfully!");
      setEmpEmail("");
      setEmpPassword("");
      setEmpFullName("");
      loadData(profile.id, profile.branch_id);
      setTimeout(() => setAddEmpStatusMsg(null), 4000);
    }
  }

  async function assignShift(employeeId: string, shiftId: string) {
    if (!shiftId) return;
    setAssignmentStatus(null);

    const { error } = await supabase
      .from("shift_assignments")
      .upsert(
        { employee_id: employeeId, shift_id: shiftId, date: selectedDate },
        { onConflict: "employee_id,date" },
      );

    if (error) {
      setAssignmentStatus(`Error: ${error.message}`);
    } else {
      setAssignmentStatus("Shift assigned successfully!");
      loadData(profile!.id, profile!.branch_id);
      setTimeout(() => setAssignmentStatus(null), 3000);
    }
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (!profile) return;
    await supabase
      .from("leave_requests")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", id);
    loadData(profile.id, profile.branch_id);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) return <p className="p-10">Loading...</p>;

  function employeeName(id: string) {
    return employees.find((e) => e.id === id)?.full_name ?? id;
  }

  async function processSalary(employeeId: string) {
    if (!profile) return;
    const currentPeriod = new Date().toISOString().slice(0, 7);

    const response = await fetch("/api/salary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId,
        managerId: profile.id,
        period: currentPeriod,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      alert(`Salary processing failed: ${result.error}`);
    } else {
      alert(
        `Pay Slip generated successfully! Net Take-Home: $${result.slip.net_take_home}`,
      );
    }
  }

  return (
    <main className="max-w-4xl mx-auto my-10 px-4 space-y-6">
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
          <p className="text-sm text-muted-foreground">
            Welcome, {profile?.full_name}
          </p>
        </CardContent>
      </Card>

      {/* Leave Requests Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Leave requests</CardTitle>
            <CardDescription>
              Approve or reject pending requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
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
                      {lr.status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => decide(lr.id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => decide(lr.id, "rejected")}
                          >
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

      {/* Explicit Ad-Hoc Attendance Input Component */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Manual Attendance Override</CardTitle>
            <CardDescription>
              Force log an attendance record for any worker on any specified
              historical or custom date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExplicitMarkAttendance} className="space-y-4">
              {attStatusMsg && (
                <div
                  className={`text-sm p-3 rounded-md ${
                    attStatusMsg.includes("successfully")
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {attStatusMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                {/* Employee Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">
                    Select Employee
                  </label>
                  <select
                    value={attTargetEmployee}
                    onChange={(e) => setAttTargetEmployee(e.target.value)}
                    className="w-full border p-2 rounded text-sm bg-background text-foreground"
                    required
                  >
                    <option value="" disabled>
                      Select worker...
                    </option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Input Box */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Target Date</label>
                  <input
                    type="date"
                    value={attTargetDate}
                    onChange={(e) => setAttTargetDate(e.target.value)}
                    className="border p-2 rounded text-sm bg-background text-foreground w-full"
                    required
                  />
                </div>

                {/* Status Options */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">
                    Status Designation
                  </label>
                  <select
                    value={attTargetStatus}
                    onChange={(e) => setAttTargetStatus(e.target.value as any)}
                    className="w-full border p-2 rounded text-sm bg-background text-foreground"
                  >
                    <option value="present">Present (Standard Hours)</option>
                    <option value="late">Late Arrival</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>

                {/* Action Submit */}
                <Button type="submit" className="w-full">
                  Save Record
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Manual Attendance Override - Calendar View */}
      <section>
        <Card className="bg-zinc-950 text-zinc-50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Manual Attendance Override
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Force log an attendance record for any worker on any specified
              historical or custom date.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {overrideStatusMsg && (
              <div className="text-sm p-3 mb-6 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800">
                {overrideStatusMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              {/* Left Side: Shadcn Calendar Component */}
              <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 flex justify-center">
                <Calendar
                  mode="single"
                  selected={activeCalendarDate}
                  onSelect={(date) => date && setActiveCalendarDate(date)}
                  className="rounded-md border border-zinc-800 text-zinc-100"
                />
              </div>

              {/* Right Side: Employee Status Table Rows */}
              <div className="md:col-span-2 space-y-6">
                <div className="grid grid-cols-2 text-sm font-semibold text-zinc-400 border-b border-zinc-800 pb-2">
                  <div>Employees (Distinct)</div>
                  <div>Status Designation</div>
                </div>

                <div className="space-y-4 max-h-[350px] overflow-y-auto pr-2">
                  {employees.map((emp) => {
                    const currentStatus = getStatusForDate(
                      emp.id,
                      activeCalendarDate,
                    );

                    return (
                      <div
                        key={emp.id}
                        className="grid grid-cols-2 items-center text-sm py-2 border-b border-zinc-900"
                      >
                        <div className="font-medium text-zinc-200">
                          {emp.full_name}
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span
                            className={`capitalize font-medium ${
                              currentStatus === "present"
                                ? "text-emerald-400"
                                : currentStatus === "late"
                                  ? "text-amber-400"
                                  : "text-rose-400"
                            }`}
                          >
                            {currentStatus}
                          </span>

                          {/* If they aren't present, show the override button seen in Frame 11938.png */}
                          {currentStatus !== "present" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200 text-xs font-medium px-3 h-8 rounded-md transition-colors"
                              onClick={() =>
                                handleStatusOverride(
                                  emp.id,
                                  activeCalendarDate,
                                  "present",
                                )
                              }
                            >
                              Mark Present
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Create Shift Template Form */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Create Shift Templates</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleCreateShift}
              className="flex flex-wrap gap-4 items-end"
            >
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Shift Name</label>
                <input
                  type="text"
                  placeholder="e.g., Night Shift"
                  value={newShiftName}
                  onChange={(e) => setNewShiftName(e.target.value)}
                  className="border p-2 rounded text-sm bg-background text-foreground w-48"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="border p-2 rounded text-sm bg-background text-foreground"
                  required
                />
              </div>
              <Button type="submit">Add Template</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Onboard New Employee Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Onboard New Employee</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              {addEmpStatusMsg && (
                <div
                  className={`text-sm p-3 rounded-md ${addEmpStatusMsg.includes("successfully") ? "bg-emerald-100 text-emerald-800" : "bg-destructive/10 text-destructive"}`}
                >
                  {addEmpStatusMsg}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={empFullName}
                    onChange={(e) => setEmpFullName(e.target.value)}
                    className="border p-2 rounded text-sm bg-background text-foreground"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Email Address</label>
                  <input
                    type="email"
                    placeholder="john@company.com"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    className="border p-2 rounded text-sm bg-background text-foreground"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold">Password</label>
                  <input
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    className="border p-2 rounded text-sm bg-background text-foreground"
                    required
                  />
                </div>
              </div>
              <Button type="submit">Add Employee Account</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Shift Scheduler Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Assign new shift</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 bg-muted/40 p-3 rounded-lg max-w-sm">
              <label htmlFor="target-date" className="text-sm font-medium">
                Target Date:
              </label>
              <input
                id="target-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border p-1 rounded text-sm bg-background text-foreground"
              />
            </div>
            {assignmentStatus && (
              <p className="text-xs font-semibold text-emerald-600">
                {assignmentStatus}
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Assign Shift for {selectedDate}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.full_name}
                    </TableCell>
                    <TableCell>
                      <select
                        defaultValue=""
                        onChange={(e) => assignShift(emp.id, e.target.value)}
                        className="w-full max-w-xs border p-2 rounded text-sm bg-background text-foreground"
                      >
                        <option value="" disabled>
                          Select a shift...
                        </option>
                        {shifts.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name} ({shift.start_time.slice(0, 5)} -{" "}
                            {shift.end_time.slice(0, 5)})
                          </option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardContent>
            <ul className="divide-y divide-border">
              {employees.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm font-medium">{e.full_name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => processSalary(e.id)}
                  >
                    Calculate Monthly Pay
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
