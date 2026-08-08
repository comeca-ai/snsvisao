import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config.js';

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (!client) {
    const { supabase } = getConfig();
    client = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
