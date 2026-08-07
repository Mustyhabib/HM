import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Layout } from "../Layout";

// The current sidebar is the H~Mltd SaaS shell: a fixed set of top-level
// destinations plus a collapse toggle whose preference persists to
// localStorage under "hm-sidebar". (The richer session sidebar — sessions,
// rename, language switcher, i18n landmarks — belonged to the pre-redesign
// Vibe-Trading layout and was intentionally removed.)

const NAV = [
  { label: "Home", href: "/dashboard" },
  { label: "Agent", href: "/agent" },
  { label: "Signals", href: "/signals" },
  { label: "Usage", href: "/usage" },
  { label: "Settings", href: "/settings" },
  { label: "Wallet", href: "/wallet" },
] as const;

function renderLayout(initialPath = "/agent") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/agent" element={<div>Agent content</div>} />
          <Route path="/signals" element={<div>Signals content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Layout", () => {
  it("renders the brand link and every primary navigation destination", () => {
    renderLayout();

    // Brand mark returns to the dashboard.
    expect(screen.getByRole("link", { name: /H~Mltd/ })).toHaveAttribute(
      "href",
      "/dashboard",
    );

    for (const { label, href } of NAV) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("highlights the destination matching the current route", () => {
    renderLayout("/agent");

    expect(screen.getByRole("link", { name: "Agent" })).toHaveClass("text-primary");
    expect(screen.getByRole("link", { name: "Signals" })).not.toHaveClass(
      "text-primary",
    );
  });

  it("renders routed content through the main outlet", () => {
    renderLayout("/agent");

    expect(screen.getByText("Agent content")).toBeInTheDocument();
  });

  it("collapses the sidebar and persists the preference", () => {
    renderLayout();
    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveClass("w-56");

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    expect(sidebar).toHaveClass("w-16");
    expect(window.localStorage.getItem("hm-sidebar")).toBe("collapsed");
  });

  it("starts collapsed when the stored preference says so", () => {
    window.localStorage.setItem("hm-sidebar", "collapsed");
    renderLayout();

    expect(screen.getByRole("complementary")).toHaveClass("w-16");
  });

  it("does not crash when localStorage access is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() => renderLayout()).not.toThrow();
  });
});
