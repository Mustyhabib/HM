/**
 * Dashboard page — smoke tests. The Dashboard is a static-content showcase
 * page with metric tiles, an equity curve SVG, a Pine Script viewer, and
 * a CTA linking to /agent. No Supabase calls, no auth gating — tests
 * verify structure, key text, and the copy-to-clipboard interaction.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Dashboard } from "../Dashboard";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard page", () => {
  it("renders the Strategy Studio heading", () => {
    renderDashboard();

    expect(screen.getByText("Strategy Studio")).toBeInTheDocument();
  });

  it("renders the agent launcher CTA linking to /agent", () => {
    renderDashboard();

    const cta = screen.getByRole("link", { name: /Open Agent/i });
    expect(cta).toHaveAttribute("href", "/agent");
  });

  it("renders all three performance metrics", () => {
    renderDashboard();

    expect(screen.getByText("Sharpe Ratio")).toBeInTheDocument();
    expect(screen.getByText("1.82")).toBeInTheDocument();
    expect(screen.getByText("Win Rate")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("Net Profit")).toBeInTheDocument();
    expect(screen.getByText("+18.4%")).toBeInTheDocument();
  });

  it("renders bottom stats including max drawdown", () => {
    renderDashboard();

    expect(screen.getByText("Total Trades")).toBeInTheDocument();
    expect(screen.getByText("152")).toBeInTheDocument();
    expect(screen.getByText("Max Drawdown")).toBeInTheDocument();
    expect(screen.getByText("-11.2%")).toBeInTheDocument();
    expect(screen.getByText("Profit Factor")).toBeInTheDocument();
    expect(screen.getByText("2.34")).toBeInTheDocument();
  });

  it("renders the equity curve SVG", () => {
    renderDashboard();

    expect(screen.getByText("Equity Curve")).toBeInTheDocument();
    // The SVG renders time period buttons
    expect(screen.getByText("1Y")).toBeInTheDocument();
    expect(screen.getByText("ALL")).toBeInTheDocument();
  });

  it("renders the pine script panel with strategy code", () => {
    renderDashboard();

    expect(screen.getByText("strategy.pine")).toBeInTheDocument();
    expect(screen.getByText("No errors")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
  });

  it("copies pine script to clipboard on copy button click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderDashboard();

    fireEvent.click(screen.getByText("Copy"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect(writeText.mock.calls[0][0]).toContain("@version=5");
    expect(screen.getByText(/strategy\.pine/)).toBeInTheDocument();
  });
});
