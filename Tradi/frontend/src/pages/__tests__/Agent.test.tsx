/**
 * Agent page — smoke tests. Covers render, gating logic (subscription/key),
 * example prompt fill, and the prompt box disabled state. Does not test
 * actual run dispatch (that's runs.test.ts) or Supabase RPCs.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Agent } from "../Agent";

// ── Mocks ────────────────────────────────────────────────────────

const runsMock = vi.hoisted(() => ({
  getActiveSubscription: vi.fn(),
  startRun: vi.fn(),
  uploadAttachment: vi.fn(),
}));

const apikeysMock = vi.hoisted(() => ({
  getApiKeyStatus: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@/lib/runs", () => runsMock);
vi.mock("@/lib/apikeys", () => apikeysMock);
vi.mock("sonner", () => ({ toast: toastMock }));

// SwarmPresetPicker and ShadowUploadPanel — stub to avoid deep dependency tree
vi.mock("@/components/chat/SwarmPresetPicker", () => ({
  SwarmPresetPicker: () => <div data-testid="swarm-picker" />,
}));
vi.mock("@/components/chat/ShadowUploadPanel", () => ({
  ShadowUploadPanel: () => <div data-testid="shadow-panel" />,
}));

const navigateMock = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderAgent() {
  return render(
    <MemoryRouter>
      <Agent />
    </MemoryRouter>,
  );
}

describe("Agent page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: active subscription + configured key → unblocked
    runsMock.getActiveSubscription.mockResolvedValue({ planId: "pro", status: "active" });
    apikeysMock.getApiKeyStatus.mockResolvedValue({
      provider: "deepseek",
      last4: "ab12",
      configured_at: "2026-08-10T00:00:00Z",
    });
  });

  it("renders the heading and prompt textarea", async () => {
    renderAgent();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/research/i);
    expect(screen.getByLabelText("Trading research prompt")).toBeInTheDocument();
    expect(screen.getByLabelText("Start run")).toBeInTheDocument();
  });

  it("renders example prompts", async () => {
    renderAgent();

    await waitFor(() => {
      expect(screen.getByText("Backtest a strategy")).toBeInTheDocument();
    });
    expect(screen.getByText("Compare regimes")).toBeInTheDocument();
    expect(screen.getByText("Screen for setups")).toBeInTheDocument();
    expect(screen.getByText("Pairs trading edge")).toBeInTheDocument();
  });

  it("fills the textarea when an example is clicked", async () => {
    renderAgent();

    await waitFor(() => {
      expect(screen.getByText("Backtest a strategy")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Backtest a strategy"));

    const textarea = screen.getByLabelText("Trading research prompt") as HTMLTextAreaElement;
    expect(textarea.value).toContain("EMA crossover");
  });

  it("shows subscription gate banner when no active subscription", async () => {
    runsMock.getActiveSubscription.mockResolvedValue(null);

    renderAgent();

    await waitFor(() => {
      expect(
        screen.getByText(/don't have an active plan/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /See plans/i })).toHaveAttribute(
      "href",
      "/pricing",
    );
  });

  it("shows API key gate banner when no key configured", async () => {
    apikeysMock.getApiKeyStatus.mockResolvedValue(null);

    renderAgent();

    await waitFor(() => {
      expect(
        screen.getByText(/Add your DeepSeek API key/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Add key/i })).toHaveAttribute(
      "href",
      "/profile#api-key",
    );
  });

  it("disables the prompt textarea and send button when blocked", async () => {
    runsMock.getActiveSubscription.mockResolvedValue(null);

    renderAgent();

    await waitFor(() => {
      expect(screen.getByLabelText("Trading research prompt")).toBeDisabled();
    });
    expect(screen.getByLabelText("Start run")).toBeDisabled();
  });

  it("navigates to run page on successful submit", async () => {
    runsMock.startRun.mockResolvedValue("run-new-id");

    renderAgent();

    await waitFor(() => {
      expect(screen.getByLabelText("Trading research prompt")).not.toBeDisabled();
    });

    const textarea = screen.getByLabelText("Trading research prompt");
    fireEvent.change(textarea, { target: { value: "Test backtest" } });
    fireEvent.click(screen.getByLabelText("Start run"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/run/run-new-id");
    });
  });

  it("shows error toast on failed submit", async () => {
    runsMock.startRun.mockRejectedValue(new Error("Subscribe to start running the agent."));

    renderAgent();

    await waitFor(() => {
      expect(screen.getByLabelText("Trading research prompt")).not.toBeDisabled();
    });

    const textarea = screen.getByLabelText("Trading research prompt");
    fireEvent.change(textarea, { target: { value: "Will fail" } });
    fireEvent.click(screen.getByLabelText("Start run"));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        "Subscribe to start running the agent.",
      );
    });
  });
});
