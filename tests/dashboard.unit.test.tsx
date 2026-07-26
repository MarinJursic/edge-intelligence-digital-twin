import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EdgeTwinDashboard } from "../app/ui/EdgeTwinDashboard";

describe("geographic operator interactions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    window.localStorage.clear();
    document.documentElement.dataset.theme = "dark";
  });

  it("presents three real-place scenarios with explicit data classifications", async () => {
    const user = userEvent.setup();
    const { container } = render(<EdgeTwinDashboard />);
    expect(screen.getByText("Camera frame → 5G cell → compute destination")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByText("REFERENCE")).toBeTruthy();
    expect(screen.getByText("OBSERVED")).toBeTruthy();
    expect(screen.getByText("AUTHORED")).toBeTruthy();
    expect(screen.getByText("COMPUTED")).toBeTruthy();
    expect(screen.getByText(/41.383820, 2.160500/)).toBeTruthy();
    expect(screen.getByText(/not asserted to be the mapped scene/)).toBeTruthy();
    expect(screen.getByText(/deterministic scenario fixtures, not measurements/)).toBeTruthy();

    const scenario = screen.getByLabelText("Scenario");
    expect((scenario as HTMLSelectElement).options).toHaveLength(3);
    await user.selectOptions(scenario, "placa-vision");
    expect(screen.getByText("Dense vision uplink")).toBeTruthy();
    expect(screen.getAllByText(/Plaça Universitat approach/).length).toBeGreaterThan(0);
    expect(container.querySelector<HTMLImageElement>(".street-evidence img")?.src).toContain(
      "placa-universitat.jpg",
    );
    await user.click(screen.getByRole("button", { name: "Geographic map" }));
    expect(screen.getByTestId("scenario-traffic").dataset.scenarioId).toBe("placa-vision");
    const placaTraffic = [...container.querySelectorAll('[data-testid="scenario-traffic"] path')]
      .map((path) => path.getAttribute("d"));
    expect(placaTraffic).not.toHaveLength(0);
    expect(screen.getAllByText(/CAM-PLACA-03 →/).length).toBeGreaterThan(0);
  });

  it("toggles every geographic and network layer", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    expect(screen.getByText(/Follow one camera frame from capture/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Layers & assets" }));
    expect(screen.getByRole("region", { name: /Interactive operations map/ })).toBeTruthy();
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
    await user.click(screen.getByRole("button", { name: "Geographic map" }));
    await user.click(screen.getByRole("button", { name: "Compare every destination" }));
    expect(screen.getByRole("dialog", { name: "Compare placement options" })).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "Placement policy" }), "cloud");
    expect(container.querySelector(".tier-route .active")?.textContent).toBe("CLOUD");
    const candidateRows = [...container.querySelectorAll(".candidate-table tbody tr")];
    expect(candidateRows[0].textContent).toContain("22.2 ms");
    expect(candidateRows[0].textContent).toContain("PLACEMENT BLOCK");
    expect(candidateRows[3].textContent).toContain("FEASIBLE");
    expect(screen.getByRole("table", { name: "Placement candidates and their feasibility" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Close scheduler" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Workload privacy" }), "restricted");
    await waitFor(() => expect(container.querySelector(".tier-route .active")?.textContent).toBe("DEVICE"));
    expect(screen.getByText(/restricted data blocks the selected remote tier/i)).toBeTruthy();
  });

  it("moves focus into the scheduler, closes on Escape, and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    const trigger = screen.getByRole("button", { name: "Compare every destination" });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: "Close scheduler" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Compare placement options" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("restores focus to the photographic journey button that opened the comparison", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    const opener = screen.getByRole("button", { name: "Why this destination?" });
    await user.click(opener);
    const close = screen.getByRole("button", { name: "Close scheduler" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.click(close);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("pauses the deterministic replay when reduced motion is requested", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<EdgeTwinDashboard />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Play replay" })).toBeTruthy(),
    );
  });

  it("preserves raw objective values and normalizes only while scoring", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Compare every destination" }));
    expect(screen.getByText("42%")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Energy objective weight"), { target: { value: "80" } });
    expect(screen.getByText("CUSTOM · raw total 160%")).toBeTruthy();
    const outputs = [...document.querySelectorAll(".weights output")].map((node) =>
      Number(node.textContent?.replace("%", "") ?? 0),
    );
    expect(outputs).toEqual([42, 80, 10, 18, 10]);
    expect(screen.getByText(/preserves the raw value you set/i)).toBeTruthy();
  });

  it("selects SVG map assets with Enter and Space and exposes synchronized state", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Geographic map" }));

    const cell = screen.getByRole("button", { name: "Select gNB-CENTRAL simulated cell" });
    cell.focus();
    await user.keyboard("{Enter}");
    expect(cell.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("n78 · 3.5 GHz")).toBeTruthy();

    const mec = screen.getByRole("button", { name: "Select MEC-WEST-02 simulated compute site" });
    mec.focus();
    await user.keyboard(" ");
    expect(mec.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("MEC-WEST-02").length).toBeGreaterThan(0);
  });

  it("keeps the UE map selection in geographic context and protects external links", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Layers & assets" }));
    await user.click(screen.getByRole("button", { name: /AV-07ACTIVE UE/i }));
    expect(screen.getByRole("region", { name: /Interactive operations map/ })).toBeTruthy();

    const osmLink = screen.getByRole("link", { name: "© OpenStreetMap contributors" });
    expect(osmLink.getAttribute("target")).toBe("_blank");
    expect(osmLink.getAttribute("rel")).toBe("noreferrer");

    await user.click(screen.getByRole("button", { name: "Street context" }));
    const photoSource = screen.getByRole("link", { name: /Pere López Brosa/ });
    expect(photoSource.getAttribute("target")).toBe("_blank");
    expect(photoSource.getAttribute("rel")).toBe("noreferrer");
  });

  it("closes map-only tools when returning to photographic context", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Layers & assets" }));
    expect(screen.getByRole("complementary", { name: "Map layers and assets" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Street context" }));
    expect(screen.queryByRole("complementary", { name: "Map layers and assets" })).toBeNull();
    expect(screen.getByText("REAL BARCELONA CONTEXT")).toBeTruthy();
  });

  it("does not duplicate the active placement card over the context decision path", () => {
    const { container } = render(<EdgeTwinDashboard />);
    expect(container.querySelector(".decision-summary > strong")?.textContent).toContain("Run at MEC-CENTRAL-01");
    expect(container.querySelector(".selection-drawer .tier-route")).toBeNull();
  });

  it("distinguishes authored fixtures from locally computed results", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    expect(screen.getByText(/Traffic, routes, topology, target profiles, nominal RSRP/)).toBeTruthy();
    expect(screen.getByText(/Replay KPIs and candidate rankings are calculated locally/)).toBeTruthy();
    expect(screen.getByText("AUTHORED UE FIXTURE")).toBeTruthy();
    expect(screen.getByText("COMPUTE DECISION · LOCAL REPLAY")).toBeTruthy();
  });

  it("simulates and restores a selected cell outage", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Layers & assets" }));
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
    await user.click(screen.getByRole("button", { name: "Geographic map" }));
    expect(screen.getByRole("region", { name: /Interactive operations map/ })).toBeTruthy();
    for (const name of ["Zoom in", "Zoom out", "Rotate map left", "Rotate map right", "Reset map bearing and pitch"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(window.localStorage.getItem("edgetwin-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("operations-map").dataset.theme).toBe("light");
  });

  it("reports a local map load failure and offers a working retry", async () => {
    const user = userEvent.setup();
    render(<EdgeTwinDashboard />);
    await user.click(screen.getByRole("button", { name: "Geographic map" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Map extract unavailable.");
    await user.click(screen.getByRole("button", { name: "Retry local map" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
