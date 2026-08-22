import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Layout } from "../Layout";

// Sidebar nav (current QuantLab design): two unlocked items at the top
// (Dashboard, Research), the rest locked/coming-soon.
// Bottom section: Settings, Profile.
//
// Two <aside> elements are rendered in the DOM at all times:
//   aria-label="Mobile navigation"   — slide-in drawer (md:hidden in CSS)
//   aria-label="Primary navigation"  — desktop persistent sidebar
// Tests that care about collapse state or active-link styling must scope
// to the labelled desktop aside so they are unambiguous.

const UNLOCKED_NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Research", href: "/agent" },
] as const;

function renderLayout(initialPath = "/agent") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/agent" element={<div>Research content</div>} />
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
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

    // BrandLogo renders "H~Mltd" in the desktop sidebar, mobile drawer, and
    // mobile top-bar — all three brand links point to /dashboard.
    const brandLinks = screen.getAllByRole("link", { name: /H~Mltd/ });
    expect(brandLinks.length).toBeGreaterThanOrEqual(1);
    brandLinks.forEach((link) =>
      expect(link).toHaveAttribute("href", "/dashboard"),
    );

    // Each unlocked nav item renders in both sidebars → getAllByRole.
    for (const { label, href } of UNLOCKED_NAV) {
      const links = screen.getAllByRole("link", { name: label });
      expect(links.length).toBeGreaterThanOrEqual(1);
      expect(links[0]).toHaveAttribute("href", href);
    }
  });

  it("highlights the destination matching the current route", () => {
    renderLayout("/agent");

    // Scope to the desktop sidebar to get a single element per link.
    const primaryNav = screen.getByRole("complementary", {
      name: "Primary navigation",
    });

    expect(within(primaryNav).getByRole("link", { name: "Research" })).toHaveClass(
      "text-primary",
    );
    expect(
      within(primaryNav).getByRole("link", { name: "Dashboard" }),
    ).not.toHaveClass("text-primary");
  });

  it("renders routed content through the main outlet", () => {
    renderLayout("/agent");

    expect(screen.getByText("Research content")).toBeInTheDocument();
  });

  it("collapses the sidebar and persists the preference", () => {
    renderLayout();
    const sidebar = screen.getByRole("complementary", {
      name: "Primary navigation",
    });
    expect(sidebar).toHaveClass("w-56");

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    expect(sidebar).toHaveClass("w-16");
    expect(window.localStorage.getItem("hm-sidebar")).toBe("collapsed");
  });

  it("starts collapsed when the stored preference says so", () => {
    window.localStorage.setItem("hm-sidebar", "collapsed");
    renderLayout();

    expect(
      screen.getByRole("complementary", { name: "Primary navigation" }),
    ).toHaveClass("w-16");
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
