import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | undefined

// Created lazily on first use so env vars are only required at runtime, not at build time.
// The accessToken option pins every database request to the service-role key: without it, any
// supabase.auth sign-in on this shared client would switch ALL later queries (for every user)
// to that user's token. Auth calls go through createAuthClient() below instead.
function getClient() {
    if (!_client) {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        _client = createClient(process.env.SUPABASE_URL!, serviceKey, {
            accessToken: async () => serviceKey,
        })
    }
    return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getClient()
        const value = Reflect.get(client, prop, client)
        return typeof value === 'function' ? value.bind(client) : value
    },
})

// A fresh client for one auth operation (sign in, refresh, admin calls). Nothing is kept
// between requests, so one user's session can never leak into another request.
export function createAuthClient() {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
}
