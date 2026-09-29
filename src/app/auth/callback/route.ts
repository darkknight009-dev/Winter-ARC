import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // If Supabase sent an error (e.g. user cancelled), bounce to auth with a flag.
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      // Self-heal: fill the default display name from Google metadata.
      // Only overwrites the literal default, never a name the user chose.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
        const name = meta.display_name || meta.full_name || meta.name;
        if (name) {
          await supabase
            .from("profiles")
            .update({ display_name: name })
            .eq("id", user.id)
            .eq("display_name", "Arc Runner");
        }
      }
      // The data layer reroutes to /onboarding until identity + habits exist.
      return NextResponse.redirect(`${origin}/`);
    }
  }

  // No code or exchange failed — back to sign-in.
  return NextResponse.redirect(`${origin}/auth`);
}
