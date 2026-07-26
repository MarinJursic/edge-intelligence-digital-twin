import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EdgeTwinDashboard } from "../app/ui/EdgeTwinDashboard";

describe("geographic operator interactions", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    window.localStorage.clear();
    document.documentElement.dataset.theme = "dark";
  });

  it("presents three real-place scenarios with explicit data classifications", async () => {
    const user = userEvent.setup();
    const { container } = render(<EdgeTwinDashboard />);
    expect(screen.getByText("OBSERVED MAP")).toBeTruthy();
    expect(screen.getByText("SIMULATED RAN")).toBeTruthy();
    expect(screen.getByText("DERIVED DECISION")).toBeTruthy();

    const scenario = screen.getByLabelText("Scenario");
    expect((scenario as HTMLSelectElement).options).toHaveLength(3);
    const granViaTraffic = [...container.querySelectorAll('[data-testid="scenario-traffic"] path')]
      .map((path) => path.getAttribute("d"));
    await user.selectOptions(scenario, "placa-vision");
    expect(screen.getByText("Dense vision uplink")).toBeTruthy();
    expect(screen.getByText(/Plaça Universitat approach/)).toBeTruthy();
    expect(screen.getByTestId("scenario-traffic").dataset.scenarioId).toBe("placa-vision");
    const placaTraffic = [...container.querySelectorAll('[data-testid="scenario-traffic"] path')]
      .map((path) => path.getAttribute("d"));
    expect(placaTraffic).not.toEqual(granViaTraffic);
    expect(screen.getByText(/CAM-PLACA-03 →/)).toBeTruthy();
  });

  it("toggles every geographic and network layer", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    for (const name of ["Buildings", "Traffic state", "Cells \\+ sectors", "MEC sites", "Task path"]) {
      const checkbox = screen.getByRole("checkbox", { name: new RegExp(name, "i") });
      expect((checkbox as HTMLInputElement).checked).toBe(true);
      await user.click(checkbox);
      expect((checkbox as HTMLInputElement).checked).toBe(false);
    }
  });

  it("opens the scheduler, changes execution policy, and enforces restricted privacy", async () => {
    const user = userEvent.setup();
    const { container } = render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Inspect scheduler" }));
    expect(screen.getByRole("dialog", { name: "Placement scheduler" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cloud" }));
    expect(container.querySelector(".tier-route .active")?.textContent).toBe("CLOUD");
    const candidateRows = [...container.querySelectorAll(".candidate-table > div")];
    expect(candidateRows[1].textContent).toContain("22.2 ms");
    expect(candidateRows[1].textContent).toContain("PLACEMENT BLOCK");
    expect(candidateRows[4].textContent).toContain("FEASIBLE");
    await user.click(screen.getByRole("button", { name: "Close scheduler" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Workload privacy" }), "restricted");
    await waitFor(() => expect(container.querySelector(".tier-route .active")?.textContent).toBe("DEVICE"));
    expect(screen.getByText(/restricted data blocks the selected remote tier/i)).toBeTruthy();
  });

  it("moves focus into the scheduler, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    const trigger = screen.getByRole("button", { name: "Inspect scheduler" });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: "Close scheduler" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Placement scheduler" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("normalizes custom objective weights and identifies the custom policy", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Inspect scheduler" }));
    fireEvent.change(screen.getByLabelText("Energy objective weight"), { target: { value: "80" } });
    expect(screen.getByText(/CUSTOM · sums to 100%/)).toBeTruthy();
    const outputs = [...document.querySelectorAll(".weights output")].map((node) =>
      Number(node.textContent?.replace("%", "") ?? 0),
    );
    expect(outputs.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(98);
    expect(outputs.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(102);
  });

  it("simulates and restores a selected cell outage", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: /gNB-CENTRALCANDIDATE CELL/i }));
    await user.click(screen.getByRole("button", { name: "Simulate gNB-CENTRAL outage" }));
    expect(screen.getAllByText("gNB-CENTRAL unavailable")).toHaveLength(2);
    expect(screen.getByText(/Five UEs handed over/)).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Reroute stabilization" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Restore gNB-CENTRAL" }));
    expect(screen.queryByText("gNB-CENTRAL unavailable")).toBeNull();
  });

  it("supports replay, scrubbing, speed selection, and stepping", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Pause replay" }));
    const position = screen.getByRole("slider", { name: "Replay position" });
    fireEvent.change(position, { target: { value: "72" } });
    expect((position as HTMLInputElement).value).toBe("72");
    await user.click(screen.getByRole("button", { name: "Step replay forward" }));
    expect((position as HTMLInputElement).value).toBe("73");
    await user.selectOptions(screen.getByRole("combobox", { name: "Replay speed" }), "2");
    expect((screen.getByRole("combobox", { name: "Replay speed" }) as HTMLSelectElement).value).toBe("2");
  });

  it("offers non-drag map camera controls and persists the complete theme", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    expect(screen.getByRole("application", { name: /Interactive operations map/ })).toBeTruthy();
    for (const name of ["Zoom in", "Zoom out", "Rotate map left", "Rotate map right", "Reset map bearing and pitch"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(window.localStorage.getItem("nexus-5g-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("operations-map").dataset.theme).toBe("light");
  });

  it("reports a local map load failure and offers a working retry", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    expect((await screen.findByRole("alert")).textContent).toContain("Map extract unavailable.");
    await user.click(screen.getByRole("button", { name: "Retry local map" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
