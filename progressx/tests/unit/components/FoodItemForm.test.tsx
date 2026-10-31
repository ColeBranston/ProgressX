// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import FoodItemForm from "@/app/internal_components/mydiet/FoodItemForm"
import QuickAddScaler, { FoodItem } from "@/app/internal_components/mydiet/QuickAddScaler"

describe("FoodItemForm", () => {
    it("sends the macros, serving and micronutrients that were entered", async () => {
        const onSubmit = vi.fn()
        render(<FoodItemForm mode="create" onSubmit={onSubmit} onCancel={() => {}} />)
        expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument()

        await userEvent.type(screen.getByLabelText("Name"), "Greek yogurt")
        await userEvent.type(screen.getByLabelText("Serving Size"), "2")
        await userEvent.clear(screen.getByRole("textbox", { name: "Serving unit" }))
        await userEvent.type(screen.getByRole("textbox", { name: "Serving unit" }), "cup")
        await userEvent.type(screen.getByLabelText("Calories"), "260")
        await userEvent.type(screen.getByLabelText("Protein (g)"), "20")
        await userEvent.type(screen.getByLabelText("Carbs (g)"), "9")
        await userEvent.type(screen.getByLabelText("Fats (g)"), "15")
        await userEvent.type(screen.getByLabelText("Fibre (g)"), "1")

        await userEvent.click(screen.getByRole("button", { name: "Add micronutrients" }))
        await userEvent.type(screen.getByLabelText("Calcium (mg)"), "400")
        await userEvent.click(screen.getByRole("button", { name: "Hide micronutrients" }))
        expect(screen.queryByLabelText("Calcium (mg)")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))
        expect(onSubmit).toHaveBeenCalledWith({
            name: "Greek yogurt", servingQty: 2, servingUnit: "cup", calories: 260, proteinG: 20, carbsG: 9, fatsG: 15, fiberG: 1,
            micronutrients: { Calcium: 400 },
        }, { saveToCatalog: false })
    })

    it("starts an edit from the logged values and offers delete", async () => {
        const onSubmit = vi.fn(async () => {})
        const onDelete = vi.fn()
        const onCancel = vi.fn()
        render(
            <FoodItemForm
                mode="edit"
                initialValues={{ name: "Rice", calories: 200, micronutrients: { Iron: 1.5 } }}
                onSubmit={onSubmit}
                onCancel={onCancel}
                onDelete={onDelete}
            />
        )
        expect(screen.getByLabelText("Name")).toHaveValue("Rice")
        expect(screen.getByLabelText("Calories")).toHaveValue(200)
        await userEvent.click(screen.getByRole("button", { name: "Add micronutrients" }))
        expect(screen.getByLabelText("Iron (mg)")).toHaveValue(1.5)

        await userEvent.click(screen.getByRole("checkbox", { name: /Save to my food catalog/ }))
        await userEvent.click(screen.getByRole("button", { name: "Save Changes" }))
        expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: "Rice", calories: 200 }), { saveToCatalog: true })

        await userEvent.click(screen.getByRole("button", { name: "Delete" }))
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        expect(onDelete).toHaveBeenCalledTimes(1)
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it("can't add twice while the first save is running", async () => {
        let finish: () => void = () => {}
        const onSubmit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
        render(<FoodItemForm mode="create" initialValues={{ name: "Toast" }} onSubmit={onSubmit} onCancel={() => {}} />)
        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))
        expect(screen.getByRole("button", { name: "Add Item" })).toBeDisabled()
        finish()
        await waitFor(() => expect(screen.getByRole("button", { name: "Add Item" })).toBeEnabled())
        expect(onSubmit).toHaveBeenCalledTimes(1)
    })
})

const yogurt: FoodItem = {
    id: "c1", name: "Yogurt", serving_size: 0.5, serving_unit: "cup", calories: 75, protein_g: 6, carbs_g: 4, fats_g: 3, fiber_g: 0,
    micronutrients: { Calcium: 150, "Vitamin B12": 0.4, Unknown: 9 },
}

describe("QuickAddScaler", () => {
    it("scales the saved food to the amount eaten", async () => {
        const onSubmit = vi.fn()
        render(<QuickAddScaler item={yogurt} onSubmit={onSubmit} onCancel={() => {}} />)
        expect(screen.getByText("1 cup serving = 75 kcal")).toBeInTheDocument()

        const amount = screen.getByLabelText("How much did you have? (cup)")
        expect(amount).toHaveValue(0.5)
        await userEvent.clear(amount)
        await userEvent.type(amount, "1.5")
        expect(screen.getByText("225")).toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Show scaled micronutrients" }))
        expect(screen.getByText("Calcium (mg)").nextSibling).toHaveTextContent("450")
        expect(screen.getByText("Vitamin B12 (μg)").nextSibling).toHaveTextContent("1.2")
        await userEvent.click(screen.getByRole("button", { name: "Hide micronutrients" }))
        expect(screen.queryByText("Calcium (mg)")).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole("button", { name: "Add Item" }))
        expect(onSubmit).toHaveBeenCalledWith({
            name: "Yogurt", servingQty: 1.5, servingUnit: "cup", calories: 225, proteinG: 18, carbsG: 12, fatsG: 9, fiberG: 0,
            micronutrients: { Calcium: 450, "Vitamin B12": 1.2, Unknown: 27 },
        }, { saveToCatalog: false })
    })

    it("steps by a quarter of a small serving, and treats a missing serving size as one", async () => {
        const { unmount } = render(<QuickAddScaler item={yogurt} onSubmit={() => {}} onCancel={() => {}} />)
        await userEvent.click(screen.getByRole("button", { name: "Increase value" }))
        expect(screen.getByLabelText(/How much/)).toHaveValue(0.63) // 0.5 + 0.125, to two places
        unmount()

        const onCancel = vi.fn()
        render(<QuickAddScaler item={{ ...yogurt, serving_size: 0, calories: 0, micronutrients: {} }} onSubmit={() => {}} onCancel={onCancel} />)
        expect(screen.getByLabelText(/How much/)).toHaveValue(1)
        expect(screen.queryByRole("button", { name: /micronutrients/ })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole("button", { name: "Increase value" }))
        expect(screen.getByLabelText(/How much/)).toHaveValue(1.5)
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
        expect(onCancel).toHaveBeenCalled()
    })
})
