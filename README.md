# Restaurant Attendance & Salary System — basic scaffold

A minimal Next.js (App Router) + Supabase app implementing:

- **Roles**: `owner` → `manager` (many per owner) → `employee` (many per manager)
- **Branches**: each owner can have multiple branches; managers/employees belong to one
- **Attendance**: employees check in / check out, timestamped
- **Leave**: employees apply for leave; their manager approves/rejects
- **Role changes**: only the owner can change the role of someone under them

No middleware, no shadcn/Tailwind config — that's left for you to add. All auth/role
guarding is done client-side with a small hook (`lib/useRequireRole.ts`).

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a project, then in the SQL editor
run the contents of `supabase/schema.sql`. This creates the tables (`branches`,
`profiles`, `attendance`, `leave_requests`) and basic RLS policies.

## 2. Set environment variables

```bash
cp .env.local.example .env.local
```

Fill in from Project Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # only used by the seed script, keep this secret
```

## 3. Install dependencies

```bash
npm install
```

## 4. Seed demo accounts

```bash
npm run seed
```

This creates real Supabase Auth users (so you can actually log in) plus matching
`profiles`, two branches, and a couple of attendance/leave rows. All seeded
passwords are `password123`:

| Email | Role | Notes |
|---|---|---|
| owner@demo.com | owner | owns both branches |
| manager1@demo.com | manager | Downtown branch |
| manager2@demo.com | manager | Uptown branch |
| employee1@demo.com | employee | reports to manager1 |
| employee2@demo.com | employee | reports to manager1, currently checked in |
| employee3@demo.com | employee | reports to manager2, has a pending leave request |

Re-running `npm run seed` is safe — it reuses existing users and resets the demo
branches/attendance/leave rows.

## 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with any seed account above, and you'll land
on `/owner`, `/manager`, or `/employee` depending on the role.

## 6. Add shadcn (your part)

```bash
npx shadcn@latest init
npx shadcn@latest add button input table select card
```

Then swap the plain HTML elements in `app/owner/page.tsx`, `app/manager/page.tsx`,
and `app/employee/page.tsx` for shadcn components at your own pace — the data
fetching/logic doesn't need to change.

## How the data model maps to roles

- `profiles.owner_id` — set on managers and employees, points at their owner.
  This is also how RLS knows what an owner is allowed to edit (role changes,
  branch assignment).
- `profiles.manager_id` — set on employees only, points at their manager.
- `profiles.branch_id` — which branch a manager/employee belongs to.

## Notes / things intentionally left simple for now

- New users (managers/employees) are currently only created via the seed script
  (using the service role key, which bypasses RLS). To let an owner invite new
  people from the UI later, you'll want a small API route that uses
  `supabase.auth.admin.createUser` with the service role key server-side.
- RLS policies are simple, direct column checks (no helper functions) — fine for
  this scale, but if you add more roles or relationships later you may want to
  centralize permission logic in SQL functions.
- Styling is bare HTML; shadcn/Tailwind setup is up to you as requested.
