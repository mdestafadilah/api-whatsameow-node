import { Loader2 } from "lucide-react";

/** Matches the `animate-spin` loader used across the dashboard. */
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}
