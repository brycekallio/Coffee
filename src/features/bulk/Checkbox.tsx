import { useEffect, useRef } from "react";

interface CheckboxProps {
  state: "none" | "some" | "all";
  label: string;
  /** `shift` is true for a shift-click (range select). */
  onToggle: (shift: boolean) => void;
}

/** The bulk-select checkbox: a real input, so keyboard and screen readers work. */
export default function Checkbox({ state, label, onToggle }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="bulk-check"
      aria-label={label}
      checked={state === "all"}
      // Selection state lives in the parent; a click only reports itself (with Shift held).
      onChange={() => {}}
      onClick={(e) => onToggle(e.shiftKey)}
    />
  );
}
