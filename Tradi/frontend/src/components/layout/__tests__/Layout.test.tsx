import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { Layout } from "../Layout";

// The current Layout renders two <aside> elements — a mobile slide-in drawer
// (hidden via CSS at md+ breakpoints) and a desktop persistent sidebar. jsdom
// does not apply CSS media queries so both are present in the DOM. Tests scope
// their assertions to the desktop sidebar (the second <aside> in DOM order)
// using testing-library's `within()`.
//
// Previously these tests used `getByRole("link", ...)` and
// `getByRole("complementary")` which threw "found multiple elements" because
// of the dual-sidebar architecture. Fixed 2026-08-21.

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

/** Return the desktop sidebar — the second `<aside>` in DOM order. */
function desktopSidebar() {
  const sidebars = screen.getAllByRole("complementary");
  // Desktop sidebar is rendered after the mobile one and has "md:flex" class
  return sidebars.find((el) => el.className.includes("md:flex")) ?? sidebars[1];
}

afterEach(() => {
  window.localStorage.clear();
});

describe("Layout", () => {
  it("renders the brand link and every primary navigation destination", () => {
    renderLayout();

    // Brand mark — present in the mobile top bar with "H~Mltd" text
    const brandLinks = screen.getAllByRole("link", { name: /H~/ });
    expect(brandLinks.length).toBeGreaterThanOrEqual(1);
    expect(brandLinks.some((el) => el.getAttribute("href") === "/dashboard")).toBe(true);

    // Nav links exist in the desktop sidebar
    const sidebar = desktopSidebar();
    for (const { label, href } of NAV) {
      const link = within(sidebar).getByRole("link", { name: label });
      expect(link).toHaveAttribute("href", href);
    }
  });

  it("highlights the destination matching the current route", () => {
    renderLayout("/agent");

    const sidebar = desktopSidebar();
    const agentLink = within(sidebar).getByRole("link", { name: "Agent" });
    const signalsLink = within(sidebar).getByRole("link", { name: "Signals" });

    expect(agentLink.className).toContain("text-primary");
    expect(signalsLink.className).not.toContain("text-primary");
  });

  it("renders routed content through the main outlet", () => {
    renderLayout("/agent");

    expect(screen.getByText("Agent content")).toBeInTheDocument();
  });

  it("collapses the sidebar and persists the preference", () => {
    renderLayout();
    const sidebar = desktopSidebar();
    expect(sidebar.className).toContain("w-56");

    fireEvent.click(screen.getByTitle("Collapse sidebar"));

    expect(sidebar.className).toContain("w-16");
    expect(window.localStorage.getItem("hm-sidebar")).toBe("collapsed");
  });

  it("starts collapsed when the stored preference says so", () => {
    window.localStorage.setItem("hm-sidebar", "collapsed");
    renderLayout();

    const sidebar = desktopSidebar();
    expect(sidebar.className).toContain("w-16");
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
