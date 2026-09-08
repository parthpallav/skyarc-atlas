"use client";

import { useEffect, useState } from "react";
import { formatDateIn, maskDateIn, parseDateIn } from "@/lib/dates";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export function IndiaDateInput({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (ymd: string) => void;
  required?: boolean;
}) {
  const [text, setText] = useState(value ? formatDateIn(`${value}T00:00:00`) : "");

  useEffect(() => {
    setText(value ? formatDateIn(`${value}T00:00:00`) : "");
  }, [value]);

  return (
    <input
      className={inputClass}
      inputMode="numeric"
      placeholder="dd/mm/yyyy"
      value={text}
      required={required}
      onChange={(event) => {
        const masked = maskDateIn(event.target.value);
        setText(masked);
        if (masked.length === 0) {
          onChange("");
          return;
        }
        if (masked.length === 10) {
          const ymd = parseDateIn(masked);
          if (ymd) onChange(ymd);
        }
      }}
    />
  );
}
