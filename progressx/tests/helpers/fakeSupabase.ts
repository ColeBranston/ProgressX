import { randomUUID } from "node:crypto"

// An in-memory stand-in for the service-role Supabase client, for API integration tests: route
// handlers run for real (auth, validation, ownership filters, response shapes) against tables held in
// memory, so no test ever touches the production database. It implements the PostgREST builder calls
// the app uses; anything else throws so a test can't silently pass against an unsupported query.

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type Result = { data: unknown, error: { code?: string, message: string } | null, count?: number | null }
type Trigger = (db: FakeSupabase) => void

const like = (pattern: string) => {
    let source = ""
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i]
        if (c === "\\" && i + 1 < pattern.length) source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        else if (c === "%") source += ".*"
        else if (c === "_") source += "."
        else source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    return new RegExp(`^${source}$`, "is")
}

class Query implements PromiseLike<Result> {
    private filters: Filter[] = []
    private orders: { column: string, ascending: boolean }[] = []
    private window: [number, number] | null = null
    private cap: number | null = null
    private columns: string | null = null
    private countMode = false
    private headOnly = false
    private one: "single" | "maybe" | null = null
    private op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
    private payload: Row[] = []
    private conflict: string[] = []
    private ignoreDuplicates = false

    constructor(private db: FakeSupabase, private table: string) {}

    select(columns = "*", options: { count?: string, head?: boolean } = {}) {
        this.columns = columns
        this.countMode = Boolean(options.count)
        this.headOnly = Boolean(options.head)
        return this
    }
    insert(rows: Row | Row[]) { this.op = "insert"; this.payload = [rows].flat(); return this }
    update(values: Row) { this.op = "update"; this.payload = [values]; return this }
    delete() { this.op = "delete"; return this }
    upsert(rows: Row | Row[], options: { onConflict?: string, ignoreDuplicates?: boolean } = {}) {
        this.op = "upsert"
        this.payload = [rows].flat()
        this.conflict = (options.onConflict ?? "id").split(",").map((c) => c.trim())
        this.ignoreDuplicates = Boolean(options.ignoreDuplicates)
        return this
    }

    private where(filter: Filter) { this.filters.push(filter); return this }
    eq(column: string, value: unknown) { return this.where((row) => row[column] === value) }
    neq(column: string, value: unknown) { return this.where((row) => row[column] !== value) }
    gt(column: string, value: unknown) { return this.where((row) => (row[column] as never) > (value as never)) }
    gte(column: string, value: unknown) { return this.where((row) => (row[column] as never) >= (value as never)) }
    lt(column: string, value: unknown) { return this.where((row) => (row[column] as never) < (value as never)) }
    lte(column: string, value: unknown) { return this.where((row) => (row[column] as never) <= (value as never)) }
    in(column: string, values: unknown[]) { return this.where((row) => values.includes(row[column])) }
    is(column: string, value: unknown) { return this.where((row) => (row[column] ?? null) === value) }
    ilike(column: string, pattern: string) { return this.where((row) => typeof row[column] === "string" && like(pattern).test(row[column] as string)) }
    or(): never { throw new Error("fakeSupabase: .or() isn't supported; mock the lib that uses it instead") }

    order(column: string, options: { ascending?: boolean } = {}) { this.orders.push({ column, ascending: options.ascending ?? true }); return this }
    range(from: number, to: number) { this.window = [from, to]; return this }
    limit(n: number) { this.cap = n; return this }
    single() { this.one = "single"; return this }
    maybeSingle() { this.one = "maybe"; return this }

    private project(rows: Row[]): Row[] {
        if (!this.columns || this.columns.trim() === "*") return rows.map((row) => ({ ...row }))
        // plain columns only; embedded resources ("profiles!fk(...)") aren't modelled
        const names = this.columns.split(",").map((c) => c.trim()).filter((c) => /^[a-z_][a-z0-9_]*$/i.test(c))
        return rows.map((row) => Object.fromEntries(names.map((name) => [name, row[name] ?? null])))
    }

    private run(): Result {
        const table = this.db.table(this.table)
        const matches = (row: Row) => this.filters.every((filter) => filter(row))
        let affected: Row[]

        if (this.op === "insert" || this.op === "upsert") {
            affected = []
            for (const values of this.payload) {
                const existing = this.op === "upsert" ? table.find((row) => this.conflict.every((c) => row[c] === values[c])) : undefined
                if (existing) {
                    if (!this.ignoreDuplicates) Object.assign(existing, values)
                    affected.push(existing)
                    continue
                }
                const clash = this.db.uniqueKeys(this.table).find((key) => table.some((row) => key.every((c) => row[c] === values[c])))
                if (clash) return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${clash.join(", ")}` } }
                const row = { id: randomUUID(), created_at: new Date().toISOString(), ...values }
                table.push(row)
                affected.push(row)
            }
        } else if (this.op === "update") {
            affected = table.filter(matches)
            for (const row of affected) Object.assign(row, this.payload[0])
        } else if (this.op === "delete") {
            affected = table.filter(matches)
            this.db.setTable(this.table, table.filter((row) => !affected.includes(row)))
        } else {
            affected = table.filter(matches)
        }
        if (this.op !== "select") this.db.fire(this.table)

        let rows = [...affected]
        for (const { column, ascending } of [...this.orders].reverse()) {
            rows.sort((a, b) => {
                const x = a[column] as never, y = b[column] as never
                return x === y ? 0 : (x < y ? -1 : 1) * (ascending ? 1 : -1)
            })
        }
        const count = rows.length
        if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1)
        if (this.cap !== null) rows = rows.slice(0, this.cap)

        // writes only return rows when .select() was chained, like PostgREST's return=minimal
        const returning = this.op === "select" || this.columns !== null
        const data = this.headOnly || !returning ? null : this.project(rows)
        if (this.one && Array.isArray(data)) {
            if (data.length > 1 || (this.one === "single" && data.length === 0)) {
                return { data: null, error: { code: "PGRST116", message: `JSON object requested, ${data.length} rows returned` } }
            }
            return { data: data[0] ?? null, error: null, count: this.countMode ? count : null }
        }
        return { data, error: null, count: this.countMode ? count : null }
    }

    then<A = Result, B = never>(onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve().then(() => this.run()).then(onFulfilled, onRejected)
    }
}

export class FakeSupabase {
    private tables = new Map<string, Row[]>()
    private triggers = new Map<string, Trigger[]>()
    private unique = new Map<string, string[][]>()

    from(table: string) { return new Query(this, table) }
    rpc(name: string): never { throw new Error(`fakeSupabase: rpc("${name}") isn't modelled`) }

    table(name: string): Row[] {
        if (!this.tables.has(name)) this.tables.set(name, [])
        return this.tables.get(name)!
    }
    setTable(name: string, rows: Row[]) { this.tables.set(name, rows) }
    seed(name: string, rows: Row[]) { this.table(name).push(...rows.map((row) => ({ ...row }))) }
    rows(name: string): Row[] { return this.table(name).map((row) => ({ ...row })) }

    // stands in for database triggers (e.g. the follower counts)
    afterWrite(table: string, trigger: Trigger) { this.triggers.set(table, [...(this.triggers.get(table) ?? []), trigger]) }
    fire(table: string) { for (const trigger of this.triggers.get(table) ?? []) trigger(this) }

    uniqueKey(table: string, columns: string[]) { this.unique.set(table, [...(this.unique.get(table) ?? []), columns]) }
    uniqueKeys(table: string) { return this.unique.get(table) ?? [] }

    reset() { this.tables.clear(); this.triggers.clear(); this.unique.clear() }
}

export const fakeDb = new FakeSupabase()
