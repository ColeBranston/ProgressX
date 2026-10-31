// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import FoodAssistant, { FoodProposal } from "@/app/internal_components/mydiet/FoodAssistant"

const pizza: FoodProposal = {
    name: "Pepperoni pizza",
    amount: "2 slices",
    accuracy: "medium",
    explanation: ["Matched a database food", "Scaled to 2 slices"],
    basis: "database",
    sourceLabel: "USDA",
    matchedName: "Pizza, pepperoni",
    base: { calories: 3, proteinG: 0.1, carbsG: 0.3, fatsG: 0.12, fiberG: 0.02, micronutrients: { Sodium: 6, Calcium: 2, Fibre: 0.02 } },
    options: [{ label: "g", multiplier: 1 }, { label: "slice", multiplier: 100 }],
    optionIndex: 1,
    quantity: 2,
    sources: [{ title: "FoodData Central", link: "https://fdc.example/1" }, { title: "Brand site", link: "https://brand.example/2" }],
}

const stew: FoodProposal = {
    ...pizza, name: "Beef stew", basis: "search", accuracy: "low", sourceLabel: "Google", matchedName: null,
    base: { calories: 250, proteinG: 20, carbsG: 15, fatsG: 10, fiberG: 3, micronutrients: {} },
    options: [{ label: "bowl", multiplier: 1 }], optionIndex: 0, quantity: 1, sources: [],
}

// The assistant's reply: one JSON event per line, split across chunks like a real stream
function reply(events: object[]) {
    const text = events.map((event) => JSON.stringify(event)).join("\n") + "\n\n"
    const middle = Math.floor(text.length / 2)
    const encoder = new TextEncoder()
    return new Response(new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(text.slice(0, middle)))
            controller.enqueue(encoder.encode(text.slice(middle)))
            controller.close()
        },
    }), { status: 200 })
}

function stubAssistant(...answers: (() => Response | Promise<Response>)[]) {
    const bodies: Record<string, unknown>[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)))
        const answer = answers[Math.min(bodies.length - 1, answers.length - 1)]
        return answer()
    })
    vi.stubGlobal("fetch", fetchMock)
    return bodies
}

function renderAssistant(onAdd = vi.fn(async () => true)) {
    render(<FoodAssistant dateKey="2026-10-14" onAdd={onAdd} open onOpenChange={() => {}} />)
    return onAdd
}

const composer = () => screen.getByRole("textbox", { name: "Describe what you ate" })

afterEach(() => vi.unstubAllGlobals())

describe("FoodAssistant chat", () => {
    it("streams a reply and a proposal, and logs it once confirmed", async () => {
        const bodies = stubAssistant(() => reply([
            { type: "status", text: "Looking it up…" },
            { type: "delta", text: "  " },
            { type: "delta", text: "Here's **pepperoni pizza**:\n- 2 slices" },
            { type: "delta", text: " from USDA." },
            { type: "proposal", proposal: pizza },
            { type: "done", history: [{ role: "user" }, { role: "model" }] },
        ]))
        const onAdd = renderAssistant()

        await userEvent.click(screen.getByRole("button", { name: "2 slices of pepperoni pizza" }))
        expect(await screen.findByText("Pepperoni pizza")).toBeInTheDocument()
        expect(screen.getByText("Looking it up…")).toBeInTheDocument()
        expect(screen.getByText("Here's pepperoni pizza: • 2 slices from USDA.", { normalizer: (s) => s.replace(/\s+/g, " ") })).toBeInTheDocument()
        expect(bodies[0]).toEqual({ history: [], message: "2 slices of pepperoni pizza", today: "2026-10-14" })

        expect(screen.getByText("Matched: Pizza, pepperoni")).toBeInTheDocument()
        expect(screen.getByText("Medium accuracy")).toBeInTheDocument()
        expect(screen.getByText("Scaled to 2 slices")).toBeInTheDocument()
        expect(screen.getByRole("link", { name: "Brand site" })).toHaveAttribute("href", "https://brand.example/2")
        expect(screen.getByText("600")).toBeInTheDocument()
        expect(screen.getByText("24g")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Show 2 micronutrients" }))
        expect(screen.getByText("1200 mg")).toBeInTheDocument() // sodium; fibre has its own tile
        await userEvent.click(screen.getByRole("button", { name: "Hide 2 micronutrients" }))
        expect(screen.queryByText("1200 mg")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("checkbox", { name: "Also save to Quick Add" }))
        await userEvent.click(screen.getByRole("button", { name: "Add to log" }))
        expect(await screen.findByText("✓ Added to your log")).toBeInTheDocument()
        expect(onAdd).toHaveBeenCalledWith({
            name: "Pepperoni pizza", servingQty: 2, servingUnit: "× slice", calories: 600, proteinG: 20, carbsG: 60, fatsG: 24, fiberG: 4,
            micronutrients: { Sodium: 1200, Calcium: 400, Fibre: 4 },
        }, { saveToCatalog: true })
        expect(screen.queryByRole("button", { name: "Add to log" })).not.toBeInTheDocument()
    })

    it("keeps the same amount of food when switching to grams", async () => {
        stubAssistant(() => reply([{ type: "proposal", proposal: pizza }]))
        const onAdd = renderAssistant()
        await userEvent.type(composer(), "pizza{Enter}")

        await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Serving size" }), "grams")
        expect(screen.getByLabelText("Amount")).toHaveValue(200)
        await userEvent.click(screen.getByRole("button", { name: "Add to log" }))
        expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ servingQty: 200, servingUnit: "g", calories: 600 }), { saveToCatalog: false })
    })

    it("says when a food couldn't be logged, so it can be tried again", async () => {
        stubAssistant(() => reply([{ type: "proposal", proposal: stew }]))
        renderAssistant(vi.fn(async () => false))
        await userEvent.type(composer(), "stew{Enter}")

        expect(await screen.findByText("Google didn't list micronutrients for this food.")).toBeInTheDocument()
        expect(screen.getByText("Low accuracy")).toBeInTheDocument()
        expect(screen.getByText("× bowl")).toBeInTheDocument() // one serving option: no picker
        await userEvent.click(screen.getByRole("button", { name: "Add to log" }))
        expect(await screen.findByText("Couldn't add it. Try again.")).toBeInTheDocument()

        await userEvent.clear(screen.getByLabelText("Amount"))
        expect(screen.getByRole("button", { name: "Add to log" })).toBeDisabled()
    })

    it("sends the conversation back on the next message and retires the old suggestion", async () => {
        const bodies = stubAssistant(
            () => reply([{ type: "proposal", proposal: pizza }, { type: "done", history: ["turn 1"] }]),
            () => reply([{ type: "proposal", proposal: { ...pizza, quantity: 3 } }, { type: "done", history: ["turn 1", "turn 2"] }]),
        )
        renderAssistant()
        await userEvent.type(composer(), "pizza{Enter}")
        await screen.findByRole("button", { name: "Add to log" })

        await userEvent.click(screen.getByRole("button", { name: "Keep refining" }))
        expect(composer()).toHaveValue("Actually, ")
        expect(composer()).toHaveFocus()
        await userEvent.type(composer(), "it was 3 slices{Enter}")

        expect(await screen.findByText("Replaced by a newer suggestion")).toBeInTheDocument()
        expect(screen.getAllByRole("button", { name: "Add to log" })).toHaveLength(1)
        expect(bodies[1]).toMatchObject({ history: ["turn 1"], message: "Actually, it was 3 slices" })

        // refining with something already typed keeps it
        await userEvent.type(composer(), "and a drink")
        await userEvent.click(screen.getByRole("button", { name: "Keep refining" }))
        expect(composer()).toHaveValue("and a drink")
    })

    it("starts a new chat from scratch", async () => {
        const bodies = stubAssistant(() => reply([{ type: "delta", text: "Hi" }, { type: "done", history: ["old"] }]))
        renderAssistant()
        await userEvent.type(composer(), "hello{Enter}")
        expect(await screen.findByText("Hi")).toBeInTheDocument()

        await userEvent.type(composer(), "draft")
        await userEvent.click(screen.getByRole("button", { name: "New chat" }))
        expect(screen.queryByText("Hi")).not.toBeInTheDocument()
        expect(composer()).toHaveValue("")
        expect(screen.getByRole("button", { name: "About a bowl of beef stew" })).toBeInTheDocument()

        await userEvent.type(composer(), "again{Enter}")
        await waitFor(() => expect(bodies).toHaveLength(2))
        expect(bodies[1].history).toEqual([])
    })

    it("shows the server's error, or a general one", async () => {
        stubAssistant(
            () => new Response(JSON.stringify({ message: "The assistant is busy" }), { status: 503 }),
            () => new Response("oops", { status: 500 }),
            () => reply([{ type: "error", message: "Search failed" }]),
            () => { throw new Error("offline") },
        )
        vi.spyOn(console, "error").mockImplementation(() => {})
        renderAssistant()

        await userEvent.type(composer(), "one{Enter}")
        expect(await screen.findByText("The assistant is busy")).toBeInTheDocument()
        await userEvent.type(composer(), "two{Enter}")
        expect(await screen.findByText("The assistant couldn't answer. Try again.")).toBeInTheDocument()
        await userEvent.type(composer(), "three{Enter}")
        expect(await screen.findByText("Search failed")).toBeInTheDocument()
        await userEvent.type(composer(), "four{Enter}")
        expect(await screen.findByText("Lost the connection to the assistant. Try again.")).toBeInTheDocument()
    })

    it("stops a reply without calling it an error", async () => {
        vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        })))
        renderAssistant()
        await userEvent.type(composer(), "pizza{Enter}")
        expect(screen.getByLabelText("Thinking")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Add a photo of a nutrition label" })).toBeDisabled()

        await userEvent.type(composer(), "ignored{Enter}") // one reply at a time
        expect(fetch).toHaveBeenCalledTimes(1)

        await userEvent.click(screen.getByRole("button", { name: "Stop" }))
        expect(await screen.findByText("Stopped")).toBeInTheDocument()
        expect(screen.queryByText(/Lost the connection/)).not.toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument()
    })

    it("does nothing for an empty message", async () => {
        stubAssistant(() => reply([]))
        renderAssistant()
        await userEvent.type(composer(), "   {Enter}")
        expect(fetch).not.toHaveBeenCalled()
        await userEvent.type(composer(), "a{Shift>}{Enter}{/Shift}b")
        expect(composer()).toHaveValue("   a\nb")
    })
})

describe("FoodAssistant label photos", () => {
    const fileInput = () => document.querySelector<HTMLInputElement>("input[type=file]")!
    const photo = (type = "image/png", bytes = 10) => new File([new Uint8Array(bytes)], "label.png", { type })

    function stubCanvas(context: object | null = { fillRect: () => {}, drawImage: () => {}, fillStyle: "" }) {
        vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3200, height: 1600, close: () => {} })))
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D)
        vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AAAA")
    }

    it("shrinks the photo and sends it, with or without a note", async () => {
        stubCanvas()
        const bodies = stubAssistant(() => reply([{ type: "delta", text: "Read the label" }]))
        renderAssistant()

        await userEvent.click(screen.getByRole("button", { name: "Add a photo of a nutrition label" }))
        await userEvent.upload(fileInput(), photo())
        expect(await screen.findByRole("img", { name: "Label photo to send" })).toHaveAttribute("src", "data:image/jpeg;base64,AAAA")
        expect(screen.getByRole("button", { name: "Send" })).toBeEnabled()

        await userEvent.click(screen.getByRole("button", { name: "Remove" }))
        expect(screen.queryByRole("img", { name: "Label photo to send" })).not.toBeInTheDocument()

        await userEvent.upload(fileInput(), photo())
        await screen.findByRole("img", { name: "Label photo to send" })
        await userEvent.click(screen.getByRole("button", { name: "Send" }))
        expect(await screen.findByRole("img", { name: "Your nutrition label photo" })).toBeInTheDocument()
        expect(bodies[0]).toMatchObject({ message: "", image: "data:image/jpeg;base64,AAAA" })

        await userEvent.upload(fileInput(), photo())
        await screen.findByRole("img", { name: "Label photo to send" })
        await userEvent.type(composer(), "I had half{Enter}")
        expect(await screen.findByText("I had half")).toBeInTheDocument()
        expect(bodies[1]).toMatchObject({ message: "I had half", image: "data:image/jpeg;base64,AAAA" })
    })

    it("explains why a photo can't be used", async () => {
        const user = userEvent.setup({ applyAccept: false })
        renderAssistant()

        await user.upload(fileInput(), photo("image/gif"))
        expect(await screen.findByText("Choose a JPG, PNG or WebP photo.")).toBeInTheDocument()

        await user.upload(fileInput(), photo("image/png", 21 * 1024 * 1024))
        expect(await screen.findByText("That photo is too big (20 MB max).")).toBeInTheDocument()

        vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("bad image") }))
        await user.upload(fileInput(), photo())
        expect(await screen.findByText("Couldn't open that photo. Try a JPG or PNG.")).toBeInTheDocument()

        stubCanvas(null)
        await user.upload(fileInput(), photo())
        expect(await screen.findByText("Couldn't process that photo.")).toBeInTheDocument()
    })
})
