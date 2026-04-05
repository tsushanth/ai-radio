import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lxtuvvsrtpoqgikbpasm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dHV2dnNydHBvcWdpa2JwYXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDA5NDEsImV4cCI6MjA4MDg3Njk0MX0.-0L2P6Wutv8hlsmMBaurznr1HgWSOWukj7rZTmmkuI4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
