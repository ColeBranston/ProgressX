// Deterministic checks on identity documents. These don't depend on the vision model reading things
// "about right": a passport's machine-readable zone (MRZ) carries check digits (ICAO 9303), and the
// barcode on the back of a North American driver's licence carries the same details as the front in a
// standard format (AAMVA). A random or made-up image fails these.

// ---------- passports: ICAO 9303 TD3 machine-readable zone (2 lines of 44 characters) ----------

const MRZ_WEIGHTS = [7, 3, 1]

function mrzValue(char: string): number {
    if (char === "<") return 0
    if (/[0-9]/.test(char)) return Number(char)
    if (/[A-Z]/.test(char)) return char.charCodeAt(0) - 55 // A = 10 ... Z = 35
    return -1
}

export function mrzCheckDigit(field: string): number {
    let sum = 0
    for (let i = 0; i < field.length; i++) {
        const value = mrzValue(field[i])
        if (value < 0) return -1
        sum += value * MRZ_WEIGHTS[i % 3]
    }
    return sum % 10
}

export type PassportMrz = {
    issuingCountry: string,
    surname: string,
    givenNames: string,
    documentNumber: string,
    nationality: string,
    birthDate: string,  // YYYY-MM-DD
    sex: string,
    expiryDate: string, // YYYY-MM-DD
}

// Cleans up MRZ text as a model or OCR reads it: uppercase, no spaces, common look-alikes fixed
export function normalizeMrzLine(line: string): string {
    return line.toUpperCase().replace(/\s+/g, "").replace(/[«‹]/g, "<").replace(/[^A-Z0-9<]/g, "")
}

// YYMMDD -> YYYY-MM-DD. Birth dates are in the past; expiry dates are within the next ~20 years.
function mrzDate(yymmdd: string, kind: "birth" | "expiry", today = new Date()): string | null {
    if (!/^\d{6}$/.test(yymmdd)) return null
    const yy = Number(yymmdd.slice(0, 2)), mm = Number(yymmdd.slice(2, 4)), dd = Number(yymmdd.slice(4, 6))
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    const currentYY = today.getUTCFullYear() % 100
    const century = kind === "birth"
        ? (yy > currentYY ? 1900 : 2000)
        : (yy < currentYY - 50 ? 2100 : 2000)
    const year = century + yy
    const date = new Date(Date.UTC(year, mm - 1, dd))
    if (date.getUTCMonth() !== mm - 1) return null // e.g. 31 February
    return date.toISOString().slice(0, 10)
}

// Parses and checks a passport MRZ; null if it isn't a valid TD3 MRZ (any check digit wrong)
export function parsePassportMrz(line1Raw: string, line2Raw: string): PassportMrz | null {
    const line1 = normalizeMrzLine(line1Raw)
    const line2 = normalizeMrzLine(line2Raw)
    if (line1.length !== 44 || line2.length !== 44 || line1[0] !== "P") return null

    const documentNumber = line2.slice(0, 9)
    const birth = line2.slice(13, 19)
    const expiry = line2.slice(21, 27)
    const checks: [string, string][] = [
        [documentNumber, line2[9]],
        [birth, line2[19]],
        [expiry, line2[27]],
    ]
    for (const [field, digit] of checks) {
        if (mrzCheckDigit(field) !== Number(digit)) return null
    }
    // optional data has its own check digit ("<" when unused), then the composite over everything
    const optional = line2.slice(28, 42)
    const optionalDigit = line2[42]
    if (!(optionalDigit === "<" && /^<+$/.test(optional)) && mrzCheckDigit(optional) !== Number(optionalDigit === "<" ? 0 : optionalDigit)) return null
    const composite = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43)
    if (mrzCheckDigit(composite) !== Number(line2[43])) return null

    const birthDate = mrzDate(birth, "birth")
    const expiryDate = mrzDate(expiry, "expiry")
    if (!birthDate || !expiryDate) return null

    const [ surname, given = "" ] = line1.slice(5).split("<<")
    return {
        issuingCountry: line1.slice(2, 5).replace(/</g, ""),
        surname: surname.replace(/</g, " ").trim(),
        givenNames: given.replace(/</g, " ").trim(),
        documentNumber: documentNumber.replace(/</g, ""),
        nationality: line2.slice(10, 13).replace(/</g, ""),
        birthDate,
        sex: line2[20],
        expiryDate,
    }
}

// The vision model reads the MRZ's letters and digits well but loses count of the "<" fillers and
// sometimes merges the lines. Line 2's important part (document number, nationality, birth date, sex,
// expiry, and their check digits) has a fixed shape, so find it in whatever was read, rebuild the
// fillers, and keep a candidate only if every check digit (including the composite) still matches.
const LINE2_CORE = /([A-Z0-9<]{9})(\d)([A-Z<]{3})(\d{6})(\d)([MFX<])(\d{6})(\d)/

export function passportFromMrzText(...readings: string[]): PassportMrz | null {
    const text = normalizeMrzLine(readings.join(""))
    const core = text.match(LINE2_CORE)
    if (!core || core.index === undefined) return null
    const head = core[0]
    const rest = text.slice(core.index + head.length).replace(/</g, " ").trim().split(/\s+/).join("")
    const composite = rest.slice(-1)
    const middle = rest.slice(0, -1)
    const fill = (value: string, n: number) => (value + "<".repeat(n)).slice(0, n)

    const candidates = new Set<string>([
        head + fill("", 14) + "<" + composite,                          // no optional data (most passports)
        head + fill("", 14) + "0" + composite,
        head + fill(middle.slice(0, -1), 14) + middle.slice(-1) + composite, // optional data + its check digit
        head + fill(middle, 14) + "<" + composite,
    ])
    // line 1 (if it was read) gives the issuing country and names; it isn't needed to verify
    const line1 = text.match(/P[A-Z<]([A-Z<]{3})([A-Z<]+?)(?=[A-Z0-9<]{9}\d[A-Z<]{3}\d{6})/)
    const line1Text = line1 ? fill(line1[0], 44) : fill(`P<${core[3]}`, 44)
    for (const candidate of candidates) {
        if (candidate.length !== 44) continue
        const parsed = parsePassportMrz(line1Text, candidate)
        if (parsed) return parsed
    }
    return null
}

// ---------- driver's licences: AAMVA PDF417 barcode on the back ----------

export type LicenceBarcode = {
    issuer: string,          // IIN, identifies the issuing province / state
    jurisdiction: string,    // e.g. "ON"
    documentNumber: string,
    surname: string,
    givenNames: string,
    birthDate: string,       // YYYY-MM-DD
    expiryDate: string,      // YYYY-MM-DD
    country: string,         // "CAN" / "USA"
    kind: "drivers_licence" | "id_card",
}

// AAMVA dates are MMDDCCYY (US) or CCYYMMDD (Canada); the country element says which
function aamvaDate(value: string | undefined, canadian: boolean): string | null {
    if (!value || !/^\d{8}$/.test(value)) return null
    const [ y, m, d ] = canadian ? [value.slice(0, 4), value.slice(4, 6), value.slice(6, 8)] : [value.slice(4, 8), value.slice(0, 2), value.slice(2, 4)]
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
    if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(m) - 1) return null
    return date.toISOString().slice(0, 10)
}

// Parses the text inside a licence's PDF417 barcode; null if it isn't an AAMVA licence record
export function parseAamva(text: string): LicenceBarcode | null {
    if (!text.startsWith("@") || !/ANSI |AAMVA/.test(text.slice(0, 40))) return null
    const iin = text.match(/(?:ANSI |AAMVA)(\d{6})/)?.[1] ?? ""

    const fields = new Map<string, string>()
    // records end with a line feed, carriage return or the ASCII record separator (0x1E)
    for (const raw of text.replaceAll(String.fromCharCode(0x1e), "\n").split(/[\n\r]+/)) {
        // the first element of each subfile follows its "DL" / "ID" marker on the same line
        const line = raw.replace(/^.*?(?:DL|ID)(?=D[A-Z]{2})/, "")
        const match = line.match(/^(D[A-Z]{2})(.*)$/)
        if (match && !fields.has(match[1])) fields.set(match[1], match[2].trim())
    }

    const country = fields.get("DCG") ?? (iin.startsWith("6") && Number(iin.slice(1, 3)) >= 3 ? "CAN" : "USA")
    const canadian = country === "CAN"
    const birthDate = aamvaDate(fields.get("DBB"), canadian)
    const expiryDate = aamvaDate(fields.get("DBA"), canadian)
    const documentNumber = fields.get("DAQ") ?? ""
    if (!birthDate || !expiryDate || !documentNumber) return null

    const surname = fields.get("DCS") ?? fields.get("DAB") ?? ""
    const givenNames = [fields.get("DAC"), fields.get("DAD")].filter(Boolean).join(" ") || (fields.get("DCT") ?? "")
    return {
        issuer: iin,
        jurisdiction: fields.get("DAJ") ?? "",
        documentNumber,
        surname,
        givenNames: givenNames.replace(/,/g, " ").trim(),
        birthDate,
        expiryDate,
        country,
        // the header's first subfile designator: "DL" licence, "ID" identification card
        kind: text.match(/(?:ANSI |AAMVA)\d{12}(DL|ID)/)?.[1] === "ID" ? "id_card" : "drivers_licence",
    }
}

// ---------- shared ----------

export function ageOn(birthDate: string, today = new Date()): number {
    const [ y, m, d ] = birthDate.split("-").map(Number)
    let age = today.getUTCFullYear() - y
    if (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d)) age--
    return age
}

// Loose name comparison (case, accents, spacing and punctuation ignored)
export function sameName(a: string, b: string): boolean {
    const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "")
    return clean(a).length > 0 && clean(a) === clean(b)
}
