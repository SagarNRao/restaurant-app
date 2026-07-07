import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function UserProfilePage({ params }: PageProps) {
  const { id } = await params;

  // Initialize the Supabase client directly inside the Server Component
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
            // The `setAll` method can be ignored if called from a Server Component
          }
        },
      },
    }
  );

  // Fetch your data
  const { data: profile, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      role,
      hourly_rate,
      overtime_rate,
      created_at,
      manager:manager_id ( full_name ),
      owner:owner_id ( full_name )
    `)
    .eq('id', id)
    .single();

  if (error || !profile) {
    notFound();
  }

  return (
    <main className="max-w-2xl mx-auto my-12 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="flex items-center justify-between border-b pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{profile.full_name}</h1>
          <p className="text-sm text-gray-500">ID: {profile.id}</p>
        </div>
        <span className="px-3 py-1 text-sm font-semibold uppercase tracking-wider rounded-full bg-blue-100 text-blue-800">
          {profile.role}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-700">Employment Info</h2>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase">Joined</label>
            <p className="text-gray-900">{new Date(profile.created_at).toLocaleDateString()}</p>
          </div>
          {profile.manager && (
            <div>
              <label className="block text-xs font-medium text-gray-400 uppercase">Reports To</label>
              <p className="text-gray-900">{profile.manager.full_name}</p>
            </div>
          )}
        </div>

        <div className="space-y-3 bg-gray-50 p-4 rounded-md border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-700">Compensation</h2>
          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase">Hourly Rate</label>
            <p className="text-2xl font-bold text-gray-900">${Number(profile.hourly_rate).toFixed(2)}/hr</p>
          </div>
        </div>
      </div>
    </main>
  );
}