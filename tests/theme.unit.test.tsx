import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { setStoredTheme, useTheme } from "../app/ui/theme";

describe("dashboard theme preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("persists the selected theme and updates subscribers", () => {
    const { result } = renderHook(() => useTheme());
    act(() => setStoredTheme("light"));
    expect(result.current).toBe("light");
    expect(window.localStorage.getItem("nexus-5g-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
