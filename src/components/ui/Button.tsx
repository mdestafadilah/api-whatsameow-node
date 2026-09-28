import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "outline" | "danger" | "dangerOutline" | "dark" | "ghost" | "link";
type Size = "xs" | "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 disabled:hover:bg-brand-600",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-400 disabled:hover:bg-white",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600 disabled:hover:bg-red-600",
  dangerOutline:
    "border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-red-400 disabled:hover:bg-white",
  dark: "bg-slate-900 text-white hover:bg-slate-800 focus-visible:outline-slate-900 disabled:hover:bg-slate-900",
  ghost:
    "text-slate-700 hover:bg-slate-100 focus-visible:outline-slate-400 disabled:hover:bg-transparent",
  link: "text-brand-700 hover:bg-brand-50 focus-visible:outline-brand-500 disabled:hover:bg-transparent",
};

const SIZES: Record<Size, string> = {
  xs: "gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold",
  sm: "gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold",
  md: "gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Swaps the leading icon for a spinner and disables the button. */
  loading?: boolean;
  /** Rendered before the label; replaced by the spinner while `loading`. */
  icon?: ReactNode;
  fullWidth?: boolean;
};

/**
 * The dashboard's only button.
 *
 * Every call site used to re-state the same twelve Tailwind classes; putting
 * them behind a variant map means a palette change is one edit, not thirty.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className={size === "xs" ? "h-3 w-3" : "h-4 w-4"} /> : icon}
      {children}
    </button>
  );
}
