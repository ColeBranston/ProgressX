import { describe, expect, it } from "vitest"
import { ageOn, mrzCheckDigit, normalizeMrzLine, parseAamva, parsePassportMrz, passportFromMrzText, sameName } from "@/app/api/libs/idDocuments"

// ICAO Doc 9303 part 4 specimen passport (Utopia)
const LINE1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<"
const LINE2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10"

describe("mrzCheckDigit", () => {
    it("uses the 7-3-1 weighting from ICAO 9303", () => {
        expect(mrzCheckDigit("L898902C3")).toBe(6)
        expect(mrzCheckDigit("740812")).toBe(2)
        expect(mrzCheckDigit("120415")).toBe(9)
        expect(mrzCheckDigit("<<<")).toBe(0)
    })
    it("returns -1 for characters an MRZ can't contain", () => {
        expect(mrzCheckDigit("ab#")).toBe(-1)
    })
})

describe("parsePassportMrz", () => {
    it("parses the ICAO specimen", () => {
        expect(parsePassportMrz(LINE1, LINE2)).toEqual({
            issuingCountry: "UTO",
            surname: "ERIKSSON",
            givenNames: "ANNA MARIA",
            documentNumber: "L898902C3",
            nationality: "UTO",
            birthDate: "1974-08-12",
            sex: "F",
            expiryDate: "2012-04-15",
        })
    })

    it("tolerates lowercase, spaces and look-alike chevrons", () => {
        expect(parsePassportMrz(LINE1.toLowerCase(), LINE2.replace(/</g, "«").replace("UTO", "U T O"))).not.toBeNull()
    })

    it.each([
        ["document number", LINE2.replace("L898902C3", "L898902C4")],
        ["birth date", LINE2.replace("740812", "740813")],
        ["expiry date", LINE2.replace("120415", "130415")],
        ["optional data", LINE2.replace("ZE184226B", "ZE184226C")],
        ["composite", LINE2.slice(0, 43) + "1"],
        ["length", LINE2.slice(0, 43)],
    ])("rejects an MRZ with a changed %s", (_, line2) => {
        expect(parsePassportMrz(LINE1, line2)).toBeNull()
    })

    it("rejects documents that aren't passports", () => {
        expect(parsePassportMrz("I" + LINE1.slice(1), LINE2)).toBeNull()
    })
})

describe("passportFromMrzText", () => {
    it("recovers the MRZ when the reader merged the lines and dropped fillers", () => {
        const sloppy = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<< L898902C36UTO7408122F1204159ZE184226B<<10"
        expect(passportFromMrzText(sloppy)?.documentNumber).toBe("L898902C3")
    })
    it("returns null for text with no machine-readable zone", () => {
        expect(passportFromMrzText("Nutrition Facts per 1 cup Calories 120")).toBeNull()
    })
})

describe("normalizeMrzLine", () => {
    it("uppercases and drops anything that isn't A-Z, 0-9 or <", () => {
        expect(normalizeMrzLine(" p<uto ‹‹ x-1 ")).toBe("P<UTO<<X1")
    })
})

// A made-up Ontario licence in the AAMVA format (dates are CCYYMMDD in Canada)
const aamva = (overrides: Record<string, string> = {}, header = "@\n\x1e\rANSI 636012080002DL00410290ZO03190008DL") => {
    const fields = { DAQ: "D1234-56789-01234", DCS: "SMITH", DAC: "JORDAN", DAD: "LEE", DBB: "19900115", DBA: "20300115", DAJ: "ON", DCG: "CAN", ...overrides }
    return header + Object.entries(fields).map(([key, value]) => key + value).join("\n") + "\r"
}

describe("parseAamva", () => {
    it("parses a Canadian licence", () => {
        expect(parseAamva(aamva())).toEqual({
            issuer: "636012",
            jurisdiction: "ON",
            documentNumber: "D1234-56789-01234",
            surname: "SMITH",
            givenNames: "JORDAN LEE",
            birthDate: "1990-01-15",
            expiryDate: "2030-01-15",
            country: "CAN",
            kind: "drivers_licence",
        })
    })

    it("reads US dates as MMDDCCYY", () => {
        const us = parseAamva(aamva({ DCG: "USA", DBB: "01151990", DBA: "01152030" }, "@\n\x1e\rANSI 636014080002DL00410290ZC03190008DL"))
        expect(us).toMatchObject({ country: "USA", birthDate: "1990-01-15", expiryDate: "2030-01-15" })
    })

    it("recognises identification cards", () => {
        expect(parseAamva(aamva({}, "@\n\x1e\rANSI 636012080002ID00410290ZO03190008ID"))?.kind).toBe("id_card")
    })

    it.each([
        ["not AAMVA", "hello world"],
        ["missing number", aamva({ DAQ: "" }).replace(/DAQ\n/, "")],
        ["impossible date", aamva({ DBB: "19900231" })],
    ])("rejects %s", (_, text) => {
        expect(parseAamva(text)).toBeNull()
    })
})

describe("ageOn / sameName", () => {
    it("counts a birthday only once it has happened", () => {
        const today = new Date(Date.UTC(2026, 9, 9))
        expect(ageOn("2008-10-09", today)).toBe(18)
        expect(ageOn("2008-10-10", today)).toBe(17)
    })
    it("compares names ignoring case, accents and punctuation", () => {
        expect(sameName("Zoë O'Brien", "ZOE OBRIEN")).toBe(true)
        expect(sameName("Anna", "Hanna")).toBe(false)
        expect(sameName("", "")).toBe(false)
    })
})
