export const themeBootScript = `
(() => {
  try {
    const stored = localStorage.getItem("nexus-5g-theme");
    const theme = stored === "dark" || stored === "light"
      ? stored
      : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
})();
`;
