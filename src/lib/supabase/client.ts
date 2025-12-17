import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://dgbyrejfcqearevvzdmf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnYnlyZWpmY3FlYXJldnZ6ZG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNzQwNDAsImV4cCI6MjA3NTk1MDA0MH0.H-JC5wb3b4xSKSXGY8Sgh4_qyapWJgUZORgvK7ogCAM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);









