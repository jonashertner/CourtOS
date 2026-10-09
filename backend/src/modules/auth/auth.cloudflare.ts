import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourtOSIdentity } from "../../lib/courtosAccess";

/** Exchange an already verified, allowlisted Access identity for Mike's own
 * HttpOnly session. generateLink does not send an email. The single-use token
 * stays between the backend and the locally operated GoTrue service. */
export async function establishCloudflareSession(
  admin: SupabaseClient,
  client: SupabaseClient,
  identity: CourtOSIdentity,
) {
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: identity.email });
  const hash = link.data?.properties?.hashed_token;
  // GoTrue returns a signup token when it creates the email's first account.
  // Use only these two expected, server-returned verification types.
  const verificationType = link.data?.properties?.verification_type;
  if (link.error || !hash || (verificationType !== "magiclink" && verificationType !== "signup") || link.data.user?.email?.toLowerCase() !== identity.email) throw new Error("CourtOS session could not be established");
  const result = await client.auth.verifyOtp({ type: verificationType, token_hash: hash });
  if (result.error || !result.data.session || result.data.user?.email?.toLowerCase() !== identity.email) throw new Error("CourtOS session could not be established");
  return result.data.user;
}
