import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "error" | "success" | "info" | "muted";

const TONES: Record<Tone, string> = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-brand-200 bg-brand-50 text-brand-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  muted: "border-slate-200 bg-slate-50 text-slate-500",
};

/**
 * Inline feedback strip.
 *
 * Replaces the half-dozen near-identical `<p className="rounded-lg bg-red-50 …">`
 * blocks that were repeated in every panel of the session page.
 */
export function Alert({
  tone = "error",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p className={cn("rounded-lg border px-3.5 py-2.5 text-xs", TONES[tone], className)}>{children}</p>
  );
}

/** Extracts a human-readable message from a thrown value. */
export function errorMessage(error: unknown, fallback = "Terjadi kesalahan."): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.length > 0) return error;
  return fallback;
}
