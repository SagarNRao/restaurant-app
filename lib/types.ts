export type UserRole = 'owner' | 'manager' | 'employee'
export type LeaveStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  owner_id: string | null
  manager_id: string | null
  branch_id: string | null
  created_at: string
}

export interface Branch {
  id: string
  owner_id: string
  name: string
  location: string | null
  created_at: string
}

export interface Attendance {
  id: string
  employee_id: string
  branch_id: string | null
  check_in: string
  check_out: string | null
  created_at: string
}

export interface LeaveRequest {
  id: string
  employee_id: string
  manager_id: string | null
  start_date: string
  end_date: string
  reason: string | null
  status: LeaveStatus
  created_at: string
  decided_at: string | null
}
