import { Timer } from "lucide-react";
import type { PacingOptions, PacingPreset, PacingPresetName } from "@/types/api";
import { cn } from "@/lib/cn";

/**
 * Describes what a preset will do for this specific message.
 *
 * The estimate mirrors `computeTypingDelay` but deliberately skips the jitter —
 * showing a range that jumps around on every keystroke would be noise, not
 * information. It is labelled as approximate for that reason.
 */
function describePreset(
  presetName: PacingPresetName,
  presets: PacingPreset[],
  charCount: number,
): string {
  const preset = presets.find((candidate) => candidate.name === presetName);
  if (!preset) return "";

  if (!preset.typing) {
    return "Sends immediately, with no typing indicator. Use only for trusted, high-volume automations.";
  }

  const raw = preset.minDelayMs + charCount * preset.msPerChar;
  const seconds = Math.round(Math.min(raw, preset.maxDelayMs) / 100) / 10;

  const cooldown =
    preset.chatCooldownMs > 0
      ? `, and keeps at least ${preset.chatCooldownMs} ms between messages to the same chat.`
      : ".";

  return `Shows "typing…" for roughly ${seconds}s${cooldown}`;
}

function PresetChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100",
      )}
    >
      {label}
    </button>
  );
}

/**
 * Anti-ban send pacing selector.
 *
 * `value === null` means "let the server pick", so the UI never has to know
 * which preset the server considers the default.
 */
export function PacingPicker({
  options,
  value,
  onChange,
  charCount,
}: {
  options: PacingOptions;
  value: PacingPresetName | null;
  onChange: (preset: PacingPresetName | null) => void;
  /** Length of the message being composed, used for the delay estimate. */
  charCount: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <Timer className="h-3.5 w-3.5" />
          Send pacing
        </span>
        {options.activeChats > 0 && (
          <span className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {options.activeChats} chat{options.activeChats === 1 ? "" : "s"} throttled
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <PresetChip
          label="Server default"
          active={value === null}
          onClick={() => onChange(null)}
        />
        {options.presets.map((preset) => (
          <PresetChip
            key={preset.name}
            label={preset.name}
            active={value === preset.name}
            onClick={() => onChange(preset.name)}
          />
        ))}
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {describePreset(value ?? options.defaultPreset, options.presets, charCount)}
      </p>
    </div>
  );
}
