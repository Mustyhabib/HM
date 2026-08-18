import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SiteFooter } from "@/components/common/SiteFooter";
import { LEGAL_NAME, SUPPORT_EMAIL } from "@/lib/company";

function renderFooter() {
  return render(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

describe("SiteFooter", () => {
  it("renders the legal name in the copyright line", () => {
    renderFooter();
    expect(screen.getByText(new RegExp(LEGAL_NAME))).toBeInTheDocument();
  });

  it("renders the current year in the copyright line", () => {
    renderFooter();
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`${year}.*${LEGAL_NAME}`))).toBeInTheDocument();
  });

  it("renders the support email as a mailto link", () => {
    renderFooter();
    const link = screen.getByRole("link", { name: SUPPORT_EMAIL });
    expect(link).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });

  it("renders Docs, Terms, and Privacy links", () => {
    renderFooter();
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("renders the placeholder phone as plain text, not a tel: link", () => {
    renderFooter();
    expect(screen.queryByRole("link", { name: /\+234/ })).not.toBeInTheDocument();
    expect(screen.getByText(/\+234 phone number/)).toBeInTheDocument();
  });
});
