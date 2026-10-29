import { randomUUID } from "node:crypto"

// An in-memory stand-in for the service-role Supabase client, for API integration tests: route
// handlers run for real (auth, validation, ownership filters, response shapes) against tables held in
// memory, so no test ever touches the production database. It implements the PostgREST builder calls
// the app uses; anything else throws so a test can't silently pass against an unsupported query.

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean
type DbError = { code?: string, message: string }
type Result = { data: unknown, error: DbError | null, count?: number | null }
type Trigger = (db: FakeSupabase) => void
type Op = "select" | "insert" | "update" | "upsert" | "delete"
// a many-to-one foreign key, for embedded resources: select("..., profiles!videos_user_id_fkey(...)")
type Relation = { name: string, from: string, column: string, to: string, references: string }
type Embed = { alias: string, table: string, hint: string | null, inner: boolean, columns: string }

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

// "a, b(c, d), e" -> ["a", "b(c, d)", "e"], ignoring commas inside brackets or quotes
function splitTopLevel(text: string): string[] {
    const parts: string[] = []
    let depth = 0, quoted = false, current = ""
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (quoted && c === "\\") { current += c + (text[++i] ?? ""); continue }
        if (c === "\"") quoted = !quoted
        else if (!quoted && c === "(") depth++
        else if (!quoted && c === ")") depth--
        if (!quoted && depth === 0 && c === ",") { parts.push(current.trim()); current = ""; continue }
        current += c
    }
    if (current.trim()) parts.push(current.trim())
    return parts
}

// a column, or a column of an embedded resource ("profiles.profile_privacy")
const valueAt = (row: Row, column: string): unknown => {
    const [head, ...rest] = column.split(".")
    if (!rest.length) return row[column]
    const embedded = row[head] as Row | null | undefined
    return embedded ? valueAt(embedded, rest.join(".")) : undefined
}

const compare = (op: string, actual: unknown, value: unknown): boolean => {
    switch (op) {
        case "eq": return actual === value
        case "neq": return actual !== value
        case "gt": return actual !== null && actual !== undefined && (actual as never) > (value as never)
        case "gte": return actual !== null && actual !== undefined && (actual as never) >= (value as never)
        case "lt": return actual !== null && actual !== undefined && (actual as never) < (value as never)
        case "lte": return actual !== null && actual !== undefined && (actual as never) <= (value as never)
        case "is": return (actual ?? null) === value
        case "ilike": return typeof actual === "string" && like(String(value)).test(actual)
        case "in": return (value as unknown[]).includes(actual)
        default: throw new Error(`fakeSupabase: filter operator "${op}" isn't modelled`)
    }
}

// a value written in a PostgREST filter string: quoted, null/true/false, or text compared as written
function filterValue(raw: string): unknown {
    if (raw.startsWith("\"") && raw.endsWith("\"")) return raw.slice(1, -1).replace(/\\(.)/g, "$1")
    if (raw === "null") return null
    if (raw === "true") return true
    if (raw === "false") return false
    return raw
}

// Parses the filters PostgREST takes in or(): "col.op.value,and(col.op.value,...),or(...)"
function parseLogic(text: string, combine: "and" | "or"): Filter {
    const filters = splitTopLevel(text).map((part): Filter => {
        const group = part.match(/^(and|or)\(([\s\S]*)\)$/)
        if (group) return parseLogic(group[2], group[1] as "and" | "or")
        const found = part.match(/^([\w.]+)\.(not\.)?(eq|neq|gt|gte|lt|lte|is|ilike|in)\.([\s\S]*)$/)
        if (!found) throw new Error(`fakeSupabase: can't parse the filter "${part}"`)
        const [, column, negate, op, raw] = found
        const value = op === "in" ? splitTopLevel(raw.replace(/^\(|\)$/g, "")).map(filterValue) : filterValue(raw)
        // a filter string is all text; PostgREST reads it as the column's own type
        const test = (row: Row) => {
            const actual = valueAt(row, column)
            return compare(op, actual, typeof actual === "number" && typeof value === "string" ? Number(value) : value)
        }
        return negate ? (row) => !test(row) : test
    })
    return combine === "and" ? (row) => filters.every((f) => f(row)) : (row) => filters.some((f) => f(row))
}

function parseColumns(columns: string): { names: string[], all: boolean, embeds: Embed[] } {
    const names: string[] = []
    const embeds: Embed[] = []
    let all = false
    for (const item of splitTopLevel(columns)) {
        if (item === "*") { all = true; continue }
        const embed = item.match(/^(?:(\w+):)?(\w+)((?:!\w+)*)\(([\s\S]*)\)$/)
        if (embed) {
            const hints = embed[3].split("!").filter(Boolean)
            embeds.push({ alias: embed[1] ?? embed[2], table: embed[2], hint: hints.find((h) => h !== "inner") ?? null, inner: hints.includes("inner"), columns: embed[4] })
        } else if (/^[a-z_][a-z0-9_]*$/i.test(item)) {
            names.push(item)
        } else {
            throw new Error(`fakeSupabase: can't parse the column "${item}"`)
        }
    }
    return { names, all, embeds }
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
    private op: Op = "select"
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
    eq(column: string, value: unknown) { return this.where((row) => compare("eq", valueAt(row, column), value)) }
    neq(column: string, value: unknown) { return this.where((row) => compare("neq", valueAt(row, column), value)) }
    gt(column: string, value: unknown) { return this.where((row) => compare("gt", valueAt(row, column), value)) }
    gte(column: string, value: unknown) { return this.where((row) => compare("gte", valueAt(row, column), value)) }
    lt(column: string, value: unknown) { return this.where((row) => compare("lt", valueAt(row, column), value)) }
    lte(column: string, value: unknown) { return this.where((row) => compare("lte", valueAt(row, column), value)) }
    in(column: string, values: unknown[]) { return this.where((row) => compare("in", valueAt(row, column), values)) }
    is(column: string, value: unknown) { return this.where((row) => compare("is", valueAt(row, column), value)) }
    ilike(column: string, pattern: string) { return this.where((row) => compare("ilike", valueAt(row, column), pattern)) }
    not(column: string, op: string, value: unknown) { return this.where((row) => !compare(op, valueAt(row, column), value)) }
    or(filters: string) { return this.where(parseLogic(filters, "or")) }

    order(column: string, options: { ascending?: boolean } = {}) { this.orders.push({ column, ascending: options.ascending ?? true }); return this }
    range(from: number, to: number) { this.window = [from, to]; return this }
    limit(n: number) { this.cap = n; return this }
    single() { this.one = "single"; return this }
    maybeSingle() { this.one = "maybe"; return this }

    // the row as PostgREST would return it for these columns, embedded resources included
    private shape(table: string, row: Row, columns: string): Row | null {
        const { names, all, embeds } = parseColumns(columns)
        const shaped: Row = all ? { ...row } : Object.fromEntries(names.map((name) => [name, row[name] ?? null]))
        for (const embed of embeds) {
            const relation = this.db.relationFor(table, embed.table, embed.hint)
            const target = this.db.table(relation.to).find((other) => other[relation.references] === row[relation.column])
            const value = target ? this.shape(relation.to, target, embed.columns) : null
            if (embed.inner && !value) return null
            shaped[embed.alias] = value
        }
        return shaped
    }

    private run(): Result {
        const failure = this.db.failure(this.table, this.op)
        if (failure) return { data: null, error: failure, count: null }

        const table = this.db.table(this.table)
        let affected: Row[]
        // filters may name embedded columns ("profiles.profile_privacy"), so reads filter the shaped rows
        let shaped: Map<Row, Row> | null = null
        if (this.op === "select" && this.columns && /\(/.test(this.columns)) {
            shaped = new Map()
            for (const row of table) {
                const view = this.shape(this.table, row, this.columns)
                if (view) shaped.set(row, { ...row, ...view })
            }
        }
        const matches = (row: Row) => {
            if (shaped && !shaped.has(row)) return false
            const view = shaped?.get(row) ?? row
            return this.filters.every((filter) => filter(view))
        }

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
        const data = this.headOnly || !returning ? null : rows.map((row) => this.shape(this.table, row, this.columns ?? "*") ?? {})
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
    private relations: Relation[] = []
    private failures: { table: string, op: Op | null, error: DbError }[] = []

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

    // a foreign key embedded resources can follow, e.g. foreignKey("videos_user_id_fkey", "videos", "user_id", "profiles")
    foreignKey(name: string, from: string, column: string, to: string, references = "id") { this.relations.push({ name, from, column, to, references }) }
    relationFor(from: string, to: string, hint: string | null): Relation {
        const found = this.relations.filter((r) => r.from === from && r.to === to && (!hint || r.name === hint))
        if (found.length !== 1) throw new Error(`fakeSupabase: no single foreign key from ${from} to ${to}${hint ? ` named ${hint}` : ""}; declare it with foreignKey()`)
        return found[0]
    }

    // makes queries on a table fail (every operation, or only one) until reset(), like a dropped connection
    failOn(table: string, op: Op | null = null, error: DbError = { message: "connection reset" }) { this.failures.push({ table, op, error }) }
    failure(table: string, op: Op): DbError | null {
        return this.failures.find((f) => f.table === table && (f.op === null || f.op === op))?.error ?? null
    }

    reset() { this.tables.clear(); this.triggers.clear(); this.unique.clear(); this.relations = []; this.failures = [] }
}

export const fakeDb = new FakeSupabase()
