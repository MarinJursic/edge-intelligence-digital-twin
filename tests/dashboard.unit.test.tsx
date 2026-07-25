import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/ui/TwinScene", () => ({
  TwinScene: ({ theme }: { theme: string }) => <div data-testid="scene" data-theme={theme}>3D scene</div>,
}));

import { EdgeTwinDashboard } from "../app/ui/EdgeTwinDashboard";

describe("operator interactions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  });

  it("switches real execution tiers and exposes all objective dimensions", async () => {
    const user = userEvent.setup();
    const { container } = render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "CLOUD" }));
    expect(container.querySelector(".node.on")?.textContent).toContain("CLOUD");
    expect(screen.getByText("$0.0048/task")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Latency objective weight"), {
      target: { value: "31" },
    });
    expect(screen.getByText("CUSTOM")).toBeTruthy();
    expect(screen.getByText("31%")).toBeTruthy();
  });

  it("re-schedules from custom weights while offline", async () => {
    const { container } = render(<EdgeTwinDashboard />);
    for (const label of [
      "Latency objective weight",
      "Cost objective weight",
      "Privacy risk objective weight",
      "Accuracy loss objective weight",
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: "5" } });
    }
    fireEvent.change(screen.getByLabelText("Energy objective weight"), {
      target: { value: "80" },
    });
    await waitFor(() =>
      expect(container.querySelector(".node.on")?.textContent).toContain("REGION"),
    );
  });

  it("blocks a cloud-only policy for restricted data in offline-safe mode", async () => {
    const user = userEvent.setup();
    const { container } = render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "CLOUD" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Workload privacy" }), "restricted");
    await waitFor(() => expect(container.querySelector(".node.on")?.textContent).toContain("DEVICE"));
    expect(screen.getByText(/restricted data blocks the selected remote tier/i)).toBeTruthy();
  });

  it("injects and restores the base-station failure", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: /inject base-station failure/i }));
    expect(screen.getByText("gNB-CENTRAL SIGNAL LOST")).toBeTruthy();
    expect(screen.getByText("REROUTE")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /restore gNB-CENTRAL/i }));
    expect(screen.queryByText("gNB-CENTRAL SIGNAL LOST")).toBeNull();
    expect(screen.getByText("RESTORED")).toBeTruthy();
  });

  it("resets both the browser replay and backend scenario contract", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: /reset/i }));
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/scenarios/metro-autonomy-01/reset"),
      { method: "POST" },
    );
  });

  it("persists light mode and passes the palette into the 3D scene", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(window.localStorage.getItem("nexus-5g-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("scene").dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeTruthy();
  });

  it("reports radio inventory and recovery progress during an outage", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: /inject base-station failure/i }));
    expect(screen.getByText("2 / 3")).toBeTruthy();
    const recovery = screen.getByRole("progressbar", { name: /reroute stabilization/i });
    expect(recovery.getAttribute("aria-valuenow")).toBe("0");
  });
});
