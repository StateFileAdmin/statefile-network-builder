import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import "./FormControls.css";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}
export function CustomSelect({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    selected = options.find((o) => o.value === value);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div
      className={`custom-select ${open ? "is-open" : ""} ${className}`}
      ref={root}
    >
      <button
        type="button"
        className="select-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span>{selected?.label || "Select…"}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="select-menu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="select-option"
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>
                <b>{option.label}</b>
                {option.description && <small>{option.description}</small>}
              </span>
              {option.value === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parse = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
export function DatePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const selected = parse(value),
    [open, setOpen] = useState(false),
    [month, setMonth] = useState(() => selected || new Date()),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [month]);
  const display = selected
    ? selected.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Select date";
  return (
    <div className="date-picker" ref={root}>
      <button
        type="button"
        className={`date-trigger ${value ? "has-value" : ""}`}
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setMonth(selected || new Date());
          setOpen(!open);
        }}
      >
        <CalendarDays size={15} />
        <span>{display}</span>
        {value && (
          <X
            size={13}
            className="date-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </button>
      {open && (
        <div className="calendar-popover">
          <header>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={16} />
            </button>
            <b>
              {month.toLocaleDateString("en-AU", {
                month: "long",
                year: "numeric",
              })}
            </b>
            <button
              type="button"
              aria-label="Next month"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={16} />
            </button>
          </header>
          <div className="calendar-weekdays">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d[0]}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((d) => {
              const dateValue = iso(d),
                today = dateValue === iso(new Date());
              return (
                <button
                  type="button"
                  key={dateValue}
                  className={`${d.getMonth() !== month.getMonth() ? "outside" : ""} ${dateValue === value ? "selected" : ""} ${today ? "today" : ""}`}
                  onClick={() => {
                    onChange(dateValue);
                    setOpen(false);
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <footer>
            <button type="button" onClick={() => onChange("")}>
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onChange(iso(today));
                setMonth(today);
                setOpen(false);
              }}
            >
              Today
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
