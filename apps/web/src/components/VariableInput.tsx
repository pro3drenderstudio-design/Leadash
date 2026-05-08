"use client";
import { useRef, useState } from "react";

const VARIABLES = [
  { label: "First name", token: "{{first_name}}" },
  { label: "Last name",  token: "{{last_name}}" },
  { label: "Company",    token: "{{company}}" },
  { label: "Title",      token: "{{title}}" },
  { label: "Email",      token: "{{email}}" },
  { label: "Website",    token: "{{website}}" },
  { label: "Full name",  token: "{{full_name}}" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function VariableInput({ value, onChange, placeholder, className }: Props) {
  const [showVars, setShowVars] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "{") {
      e.preventDefault();
      setShowVars(true);
    } else if (e.key === "Escape") {
      setShowVars(false);
    }
  }

  function insertVariable(token: string) {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? value.length;
    const end   = input.selectionEnd   ?? value.length;
    const next  = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    setShowVars(false);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowVars(false), 150)}
        placeholder={placeholder}
        className={className}
      />
      {showVars && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-xl py-1 min-w-48">
          {VARIABLES.map(v => (
            <button
              key={v.token}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertVariable(v.token); }}
              className="w-full text-left px-4 py-2 text-xs text-white/70 hover:text-white hover:bg-white/6 transition-colors flex justify-between items-center gap-3"
            >
              <span>{v.label}</span>
              <span className="text-white/30 font-mono text-[10px]">{v.token}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
