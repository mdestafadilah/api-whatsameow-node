import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The `.card` surface from `index.css`, with the dashboard's default padding. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-5", className)} {...rest} />;
}

/**
 * Icon + title row that opens most cards.
 *
 * `action` is the right-aligned slot used for counters and buttons, so callers
 * do not have to re-invent the flex layout each time.
 */
export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-2", className)}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}
