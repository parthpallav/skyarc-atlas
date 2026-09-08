"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysYmd, formatDateIn, todayYmd } from "@/lib/dates";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ymd(date: Date): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthCells(year: number, month: number): Array<{ ymd: string; inMonth: boolean }> {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ ymd: string; inMonth: boolean }> = [];
  for (let i = 0; i < startOffset; i++) {
    const date = new Date(year, month, i - startOffset + 1);
    cells.push({ ymd: ymd(date), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ ymd: ymd(new Date(year, month, day)), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = parseYmd(cells[cells.length - 1]!.ymd)!;
    last.setDate(last.getDate() + 1);
    cells.push({ ymd: ymd(last), inMonth: false });
  }
  return cells;
}

function inRange(day: string, start?: string, end?: string): boolean {
  if (!start || !end) return false;
  return day >= start && day <= end;
}

export function FlightDateRangeCalendar({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  const today = todayYmd();
  const initial = parseYmd(startDate) ?? new Date();
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [pickingEnd, setPickingEnd] = useState(false);

  const months = useMemo(
    () => [
      { year: cursor.year, month: cursor.month },
      {
        year: cursor.month === 11 ? cursor.year + 1 : cursor.year,
        month: cursor.month === 11 ? 0 : cursor.month + 1,
      },
    ],
    [cursor]
  );

  function shift(delta: number) {
    setCursor((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  function selectDay(day: string) {
    if (day < today) return;
    if (!startDate || (startDate && endDate) || !pickingEnd) {
      onChange(day, "");
      setPickingEnd(true);
      return;
    }
    if (day < startDate) {
      onChange(day, startDate);
      setPickingEnd(false);
      return;
    }
    onChange(startDate, day);
    setPickingEnd(false);
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-violet-100 bg-violet-50/50">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="p-1.5 rounded-lg hover:bg-white text-slate-600"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="text-sm font-semibold text-slate-900">
          {startDate && endDate
            ? `${formatDateIn(`${startDate}T00:00:00`)} – ${formatDateIn(`${endDate}T00:00:00`)}`
            : startDate
              ? `${formatDateIn(`${startDate}T00:00:00`)} → pick end date`
              : "Select campaign dates"}
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          className="p-1.5 rounded-lg hover:bg-white text-slate-600"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-violet-100">
        {months.map((month) => (
          <div key={`${month.year}-${month.month}`} className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2 text-center">
              {MONTHS[month.month]} {month.year}
            </p>
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAYS.map((day) => (
                <span key={day} className="text-[10px] font-semibold text-muted text-center py-1">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {monthCells(month.year, month.month).map((cell, index) => {
                const selectedStart = cell.ymd === startDate;
                const selectedEnd = cell.ymd === endDate;
                const ranged = inRange(cell.ymd, startDate, endDate);
                const past = cell.ymd < today;
                return (
                  <button
                    key={`${cell.ymd}-${index}`}
                    type="button"
                    disabled={past}
                    onClick={() => selectDay(cell.ymd)}
                    className={`h-9 text-xs rounded-lg font-medium ${
                      selectedStart || selectedEnd
                        ? "bg-primary text-white"
                        : ranged
                          ? "bg-violet-100 text-slate-900"
                          : past
                            ? "text-slate-300 cursor-not-allowed"
                            : cell.inMonth
                              ? "text-slate-800 hover:bg-violet-50"
                              : "text-slate-400 hover:bg-violet-50"
                    }`}
                  >
                    {Number(cell.ymd.slice(8))}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function applyFlightPreset(start: string | undefined, days: number): { start: string; end: string } {
  const from = start && start >= todayYmd() ? start : todayYmd();
  return { start: from, end: addDaysYmd(from, days - 1) };
}
