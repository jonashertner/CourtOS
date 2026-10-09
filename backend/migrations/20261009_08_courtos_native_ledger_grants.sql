-- Migration date: 2026-10-09
-- Remove inherited broad defaults. Reservations/releases use owner-run RPCs.
revoke all on public.courtos_native_starts from public, anon, authenticated, service_role;
grant select on public.courtos_native_starts to service_role;
notify pgrst, 'reload schema';
