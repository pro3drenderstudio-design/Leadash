"use client";
import React, { useEffect, useRef } from "react";

interface EditableProps {
  tag?: keyof React.JSX.IntrinsicElements;
  value: string;
  editable: boolean;
  style?: React.CSSProperties;
  onCommit: (val: string) => void;
  onFocus?: () => void;
}

export function Editable({ tag = "div", value, editable, style, onCommit, onFocus }: EditableProps) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== (value ?? "")) el.textContent = value ?? "";
  }, [value]);

  const props: Record<string, unknown> = {
    ref,
    contentEditable: editable || undefined,
    suppressContentEditableWarning: true,
    spellCheck: false,
    style: { ...style, outline: "none", cursor: editable ? "text" : undefined },
  };
  if (editable) {
    props.onMouseDown = (e: React.MouseEvent) => { e.stopPropagation(); onFocus?.(); };
    props.onClick     = (e: React.MouseEvent) => e.stopPropagation();
    props.onBlur      = (e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.textContent ?? "");
  }
  return React.createElement(tag as string, props);
}
