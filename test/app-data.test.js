import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRegistrationRequests } from '../app-data.js';

function registrationClient({ data = [], error = null } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return {
        select(columns) {
          calls.push(['select', columns]);
          return {
            order(column, options) {
              calls.push(['order', column, options]);
              return Promise.resolve({ data, error });
            }
          };
        }
      };
    }
  };
  return { client, calls };
}

test('registration refresh requests the expected table and sort order', async () => {
  const rows = [{ user_id: 'player-2', display_name: 'Asha', status: 'pending' }];
  const { client, calls } = registrationClient({ data: rows });

  assert.deepEqual(await fetchRegistrationRequests(client), rows);
  assert.deepEqual(calls, [
    ['from', 'registration_requests'],
    ['select', '*'],
    ['order', 'created_at', { ascending: true }]
  ]);
});

test('registration refresh returns an empty list when Supabase returns null data', async () => {
  const { client } = registrationClient({ data: null });
  assert.deepEqual(await fetchRegistrationRequests(client), []);
});

test('registration refresh exposes a Supabase permission error to the app', async () => {
  const error = new Error('permission denied for table registration_requests');
  const { client } = registrationClient({ error });
  await assert.rejects(fetchRegistrationRequests(client), error);
});
