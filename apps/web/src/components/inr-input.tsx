"use client";

import { formatInrInput, parseInrInput } from "@/lib/format";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export function InrInput({
  value,
  onChange,
  required,
}: {
  value: number;
  onChange: (amount: number) => void;
  required?: boolean;
}) {
  return (
    <input
      className={inputClass}
      inputMode="numeric"
      placeholder="₹5,00,000"
      value={formatInrInput(value)}
      required={required}
      onChange={(event) => onChange(parseInrInput(event.target.value))}
    />
  );
}
