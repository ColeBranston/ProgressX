import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | undefined

// Created lazily on first use so env vars are only required at runtime, not at build time
function getClient() {
    if (!_client) {
        _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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
