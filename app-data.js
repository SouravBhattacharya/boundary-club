// Data access functions accept a Supabase-compatible client so they can be
// tested with a mock instead of a real project.

export async function fetchRegistrationRequests(client) {
  const { data, error } = await client
    .from('registration_requests')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}
