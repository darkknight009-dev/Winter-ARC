import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PHOTO_BUCKET = "progress-photos";
const PAGE_SIZE = 1000;

type StorageBucket = ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>;

/** Lists every file below a user's storage folder, including nested folders. */
async function listUserFiles(bucket: StorageBucket, prefix: string): Promise<string[]> {
  const files: string[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw error;

    const entries = data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        files.push(...(await listUserFiles(bucket, path)));
      } else {
        files.push(path);
      }
    }

    if (entries.length < PAGE_SIZE) break;
  }

  return files;
}

async function removeFiles(bucket: StorageBucket, files: string[]) {
  for (let index = 0; index < files.length; index += PAGE_SIZE) {
    const { error } = await bucket.remove(files.slice(index, index + PAGE_SIZE));
    if (error) throw error;
  }
}

export async function POST() {
  const authSupabase = await createServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in to delete your data." }, { status: 401 });
  }

  // Storage cleanup needs the service role. Failing closed is safer than
  // deleting database rows while leaving private photos behind.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Data deletion is not configured on this server." },
      { status: 503 }
    );
  }

  try {
    const adminSupabase = createAdminClient();
    const bucket = adminSupabase.storage.from(PHOTO_BUCKET);
    const files = await listUserFiles(bucket, user.id);
    await removeFiles(bucket, files);

    // This function deletes all relational app data, including sealed check-ins.
    // It intentionally leaves the auth identity so the user can start over.
    const { error } = await authSupabase.rpc("delete_my_data");
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete user data", error);
    return NextResponse.json(
      { error: "We could not complete data deletion. Please try again." },
      { status: 500 }
    );
  }
}
