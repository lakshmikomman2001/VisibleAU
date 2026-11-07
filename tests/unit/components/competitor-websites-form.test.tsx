// @vitest-environment jsdom
/**
 * Fair competitor counting (7 Nov) -- brand settings let each competitor have a website, which is what
 * verifies a mention of it, and say how many are left out without one.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { CompetitorWebsitesForm } from "@/components/domain/brand/competitor-websites-form";

afterEach(() => vi.restoreAllMocks());

function renderForm() {
  return render(
    React.createElement(CompetitorWebsitesForm, {
      brandId: "b1",
      competitors: ["Rivalto Plumbing", "Harbourline Drains"],
      websites: { "Rivalto Plumbing": "rivalto.example.com.au" },
    }),
  );
}

describe("competitor websites form", () => {
  it("shows each competitor's website, and says how many have none", () => {
    renderForm();
    expect(screen.getByLabelText("Rivalto Plumbing")).toHaveValue("rivalto.example.com.au");
    expect(screen.getByLabelText("Harbourline Drains")).toHaveValue("");
    expect(screen.getByText(/1 has no website yet, so it's left out/)).toBeInTheDocument();
  });

  it("saves through PATCH /api/brands/[brandId] and shows what was stored", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          brand: {
            competitorWebsites: {
              "Rivalto Plumbing": "rivalto.example.com.au",
              "Harbourline Drains": "harbourline.example.com.au",
            },
          },
        }),
        { status: 200 },
      ),
    );
    renderForm();
    fireEvent.change(screen.getByLabelText("Harbourline Drains"), {
      target: { value: "https://www.Harbourline.example.com.au/" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save websites" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Saved"));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/brands/b1");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      competitorWebsites: {
        "Rivalto Plumbing": "rivalto.example.com.au",
        "Harbourline Drains": "https://www.Harbourline.example.com.au/",
      },
    });
    expect(screen.getByLabelText("Harbourline Drains")).toHaveValue("harbourline.example.com.au");
  });

  it("says what went wrong when the save is refused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "competitorWebsites: not a site isn't a website address" }),
        {
          status: 400,
        },
      ),
    );
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Save websites" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("isn't a website address"),
    );
  });
});
