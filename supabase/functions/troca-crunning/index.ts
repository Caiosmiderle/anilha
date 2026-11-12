import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCrunning } from './core.ts';

const client = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);
Deno.serve((req) =>
  handleCrunning(req, async (hash, operation, payload) => {
    const { data, error } = await client.rpc('crunning_exchange', {
      p_hash: hash,
      p_operation: operation,
      p_payload: payload,
    });
    if (error) throw new Error('Banco indisponível');
    return data;
  }),
);
