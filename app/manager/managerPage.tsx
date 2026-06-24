"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/useRequireRole";
import type { Attendance, LeaveRequest, Profile } from "@/lib/types";

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

// Quick type definitions for the new tables
interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

export default function ManagerPage() {
  const router = useRouter();

  // New states for the Add Employee Form
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
  const [attendance, setAttendance] = useState<Attendance[]>([]);

  // New State for Shifts
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0], // Defaults to today
  );
  const [assignmentStatus, setAssignmentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (profile) loadData(profile.id, profile.branch_id);
  }, [profile]);

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
        // Fetching from our new custom view instead of raw attendance
        supabase
          .from("daily_roster_status")
          .select("*")
          .order("roster_date", { ascending: false })
          .limit(30),
      ]);

    setShifts(shiftTemplates);
    setEmployees(emp ?? []);
    setLeaveRequests(leave ?? []);
    setRoster(rosterData ?? []); // Sets the combined roster state
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.branch_id || !newShiftName) return;

    // Database expects TIME format: "HH:MM:SS"
    const formattedStart = `${startTime}:00`;
    const formattedEnd = `${endTime}:00`;

    const { error } = await supabase.from("shifts").insert({
      branch_id: profile.branch_id,
      name: newShiftName,
      start_time: formattedStart,
      end_time: formattedEnd,
    });

    if (error) {
      alert(`Failed to create shift: ${error.message}`);
    } else {
      setNewShiftName(""); // Reset form
      loadData(profile.id, profile.branch_id); // Refresh shift list dropdown
    }
  }

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setAddEmpStatusMsg(null);

    // Send the payload straight to our brand new API route
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: empEmail,
        password: empPassword,
        fullName: empFullName,
        managerId: profile.id, // Active manager's ID
        branchId: profile.branch_id, // Blended automatically to current active branch
        ownerId: profile.owner_id, // Inherited directly from the branch mapping
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
      // Refresh the employee state grid so they show up on the shift selectors instantly
      loadData(profile.id, profile.branch_id);
      setTimeout(() => setAddEmpStatusMsg(null), 4000);
    }
  }

  async function assignShift(employeeId: string, shiftId: string) {
    if (!shiftId) return;
    setAssignmentStatus(null);

    // Upsert assignment (if they already have a shift today, overwrite it)
    const { error } = await supabase.from("shift_assignments").upsert(
      {
        employee_id: employeeId,
        shift_id: shiftId,
        date: selectedDate,
      },
      { onConflict: "employee_id,date" },
    );

    if (error) {
      setAssignmentStatus(`Error: ${error.message}`);
    } else {
      setAssignmentStatus("Shift assigned successfully!");
      // Clear status message after 3 seconds
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

  // Put this function inside your ManagerPage component
  async function updateEmployeeDefaultShift(
    employeeId: string,
    shiftId: string,
  ) {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({ shift_id: shiftId })
      .eq("id", employeeId);

    if (error) {
      alert(`Failed to update shift: ${error.message}`);
    } else {
      // Refresh the local state data
      loadData(profile.id, profile.branch_id);
    }
  }

  async function processSalary(employeeId: string) {
    if (!profile) return;
    const currentPeriod = new Date().toISOString().slice(0, 7); // Returns "2026-06"

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
                            variant="default"
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

      {/* Attendance Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Daily Shift Roster & Attendance Tracking</CardTitle>
            <CardDescription>
              Real-time look at schedules, clock-ins, leaves, and absences.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Actual Check In</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((row) => (
                  <TableRow key={row.assignment_id}>
                    <TableCell className="font-medium">
                      {employeeName(row.employee_id)}
                    </TableCell>
                    <TableCell>{row.roster_date}</TableCell>
                    <TableCell>{row.shift_name}</TableCell>
                    <TableCell>
                      {row.check_in
                        ? new Date(row.check_in).toLocaleTimeString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          row.final_status === "present"
                            ? "bg-emerald-100 text-emerald-800"
                            : row.final_status === "late"
                              ? "bg-amber-100 text-amber-800"
                              : row.final_status === "on leave"
                                ? "bg-blue-100 text-blue-800"
                                : row.final_status === "absent"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.final_status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Create Shift Template Form */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Create Shift Templates</CardTitle>
            <CardDescription>
              Define standard working hours for your branch
            </CardDescription>
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
            <CardDescription>
              Instantly register a new team member to your active branch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              {addEmpStatusMsg && (
                <div
                  className={`text-sm p-3 rounded-md ${
                    addEmpStatusMsg.includes("successfully")
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-destructive/10 text-destructive"
                  }`}
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

              <Button type="submit" className="w-full md:w-auto">
                Add Employee Account
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* Shift Scheduler Section */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle>SAssign new shift</CardTitle>
            <CardDescription>Assign new shifts to employees</CardDescription>
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
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
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
    <li key={e.id} className="flex items-center justify-between py-2.5">
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
