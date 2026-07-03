import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fill these in with your own Supabase project's values (same ones used in
// the extension's config.js): Dashboard -> Settings -> API.
const SUPABASE_URL = "https://kgzqnqzoighlxeqdkrzg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnenFucXpvaWdobHhlcWRrcnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMDg0MjgsImV4cCI6MjA5ODY4NDQyOH0.V-e-OiPrrKMDahniFYpM0p1Hz2Ix2pfqz1tun-EFiBI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
