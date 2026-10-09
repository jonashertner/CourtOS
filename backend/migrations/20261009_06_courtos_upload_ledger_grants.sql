-- Migration date: 2026-10-09
-- Supabase can grant service_role broad table rights through default privileges.
-- The app may inspect its reservation receipt, but must never erase or reduce
-- accepted storage charges. Admission remains inside the security-definer RPC.
revoke all on public.courtos_upload_reservations from service_role;
grant select on public.courtos_upload_reservations to service_role;
