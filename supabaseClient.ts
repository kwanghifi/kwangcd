
import { createClient } from '@supabase/supabase-js';

// ตรวจสอบตัวแปรอย่างปลอดภัย
const env = typeof process !== 'undefined' ? process.env : {};

const supabaseUrl = env.SUPABASE_URL || 'https://vebtsqtoiifhakffyoau.supabase.co';
const supabaseAnonKey = env.SUPABASE_ANON_KEY || 'sb_publishable_SZeunouwXq1LpDo4a5tyoQ_Dm1cvfHX';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
