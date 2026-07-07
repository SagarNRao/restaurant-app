import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function UserProfilePage(props: PageProps) {
  const params = await props.params;
  
  // Clean up URL encoding safely
  const decodedName = decodeURIComponent(params.name).replace(/-/g, " ");

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Safe to ignore inside Server Components
          }
        },
      },
    }
  );

  // Fetch the target employee profile row by matching the name column
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(`
      id,
      full_name,
      role,
      hourly_rate,
      overtime_rate,
      created_at,
      manager_id
    `)
    .ilike("full_name", decodedName)
    .maybeSingle();

  // If nobody with that name exists, default to 404
  if (error || !profile) {
    notFound();
  }

  return (
    <main className="max-w-2xl mx-auto my-12 p-6 bg-zinc-950 text-zinc-50 border border-zinc-800 rounded-lg shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">{profile.full_name}</h1>
          <p className="text-xs text-zinc-500 font-mono mt-1">ID: {profile.id}</p>
        </div>
        <span className={`px-3 py-1 text-sm font-semibold uppercase tracking-wider rounded-full ${
          profile.role === "manager" ? "bg-amber-950 text-amber-400 border border-amber-800" :
          profile.role === "owner" ? "bg-purple-950 text-purple-400 border border-purple-800" :
          "bg-blue-950 text-blue-400 border border-blue-800"
        }`}>
          {profile.role}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-300">Employment Info</h2>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase">Joined Record Date</label>
            <p className="text-zinc-200 mt-0.5">{new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="space-y-3 bg-zinc-900/50 p-4 rounded-md border border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-300">Compensation Structure</h2>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase">Base Hourly Compensation</label>
            <p className="text-2xl font-bold text-zinc-100 mt-1">${Number(profile.hourly_rate).toFixed(2)}/hr</p>
          </div>
          <div className="pt-2">
            <label className="block text-xs font-medium text-zinc-500 uppercase">Authorized Overtime Rate</label>
            <p className="text-xl font-semibold text-emerald-400 mt-0.5">${Number(profile.overtime_rate).toFixed(2)}/hr</p>
          </div>
        </div>
      </div>
    </main>
  );
}