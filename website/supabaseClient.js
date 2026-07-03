import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fill these in with your own Supabase project's values (same ones used in
// the extension's config.js): Dashboard -> Settings -> API.
const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
