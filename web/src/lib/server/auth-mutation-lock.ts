import type { QueryExecutor } from "@/lib/server/database";

const AUTH_MUTATION_LOCK_KEY = "vozeb-pro-auth-mutation-v1";

export async function lockAuthMutation(client: QueryExecutor) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [AUTH_MUTATION_LOCK_KEY]);
}
