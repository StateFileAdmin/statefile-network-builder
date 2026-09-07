import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
    [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((option) => option.value === value),
    selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
    window.setTimeout(() => optionRefs.current[index]?.focus(), 0);
  };
  const move = (event: KeyboardEvent, index: number) => {
    if (event.key === "Escape") {
      setOpen(false);
      root.current
        ?.querySelector<HTMLButtonElement>(".select-trigger")
        ?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : event.key === "ArrowDown"
            ? (index + 1) % options.length
            : (index - 1 + options.length) % options.length;
    setActive(next);
    optionRefs.current[next]?.focus();
  };
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
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openAt(selectedIndex);
          }
        }}
      >
        <span>{selected?.label || "Select…"}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="select-menu" role="listbox" aria-label={label}>
          {options.map((option, index) => (
            <button
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              tabIndex={index === active ? 0 : -1}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="select-option"
              key={option.value}
              onKeyDown={(event) => move(event, index)}
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
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : null;
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
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
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
            onClick={(event) => {
              event.stopPropagation();
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
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day[0]}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((date) => {
              const dateValue = iso(date);
              return (
                <button
                  type="button"
                  key={dateValue}
                  className={`${date.getMonth() !== month.getMonth() ? "outside" : ""} ${dateValue === value ? "selected" : ""} ${dateValue === iso(new Date()) ? "today" : ""}`}
                  onClick={() => {
                    onChange(dateValue);
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
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
