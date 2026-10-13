import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://lxtuvvsrtpoqgikbpasm.supabase.co';
// Publishable key (safe in the client). The legacy JWT anon key was disabled on 2026-10-04.
export const SUPABASE_ANON_KEY = 'sb_publishable_Na10AyQXfYGTgsFAnZYbBw_ixt_2Tof';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
