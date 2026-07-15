import { Moon, Sun } from "lucide-react";

import type { Theme } from "./theme";

export interface ThemeSwitchProps {
  readonly theme: Theme;
  readonly lightLabel: string;
  readonly darkLabel: string;
  readonly onToggle: () => void;
}

export function ThemeSwitch({ theme, lightLabel, darkLabel, onToggle }: ThemeSwitchProps) {
  const targetTheme = theme === "light" ? "dark" : "light";
  const label = targetTheme === "light" ? lightLabel : darkLabel;
  const Icon = targetTheme === "light" ? Sun : Moon;

  return (
    <button
      aria-label={label}
      className="icon-button theme-switch"
      data-theme-target={targetTheme}
      title={label}
      type="button"
      onClick={onToggle}
    >
      <Icon aria-hidden="true" focusable="false" size={16} strokeWidth={1.8} />
    </button>
  );
}
