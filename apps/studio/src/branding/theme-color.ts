const STUDIO_THEME_COLORS = {
  light: "#F4F6F5",
  dark: "#111715",
} as const;

export function syncStudioThemeColor(
  theme: keyof typeof STUDIO_THEME_COLORS,
  target: Document = document,
): void {
  target
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", STUDIO_THEME_COLORS[theme]);
}
