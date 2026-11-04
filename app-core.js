// Pure application rules. This module deliberately has no browser or Supabase dependency.

export const lockAt = (match) => new Date(new Date(match.starts_at).getTime() - 30 * 60 * 1000);

export const isPickWindowOpen = (match, now = Date.now()) =>
  match.status === 'scheduled' && now < lockAt(match).getTime();

export const parseIndiaDateTime = (value) => {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30)).toISOString();
};

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

// Before a match locks, a user receives only their own pick. Once locked, all
// match picks returned by the database may be displayed. Duplicate rows are
// collapsed by prediction id.
export const visiblePicks = ({ ownPicks = [], lockedPicks = [] }) =>
  [...new Map([...ownPicks, ...lockedPicks].map((pick) => [pick.id, pick])).values()];

export const pendingRegistrationCount = (requests = []) =>
  requests.filter((request) => request.status === 'pending').length;
