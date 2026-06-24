"use client";

/**
 * Small client component that wires up the ⌘K palette globally.
 *
 * Layouts are server components, so we need this thin client wrapper to
 * own the open/close state and the keyboard listener. Drop it once at the
 * top of each layout and the palette becomes available everywhere inside.
 *
 * Side effect: also fires a custom `app:open-command-palette` event that
 * any chrome (sidebar, topbar) can dispatch to open the palette
 * programmatically without prop-drilling.
 */

import * as React from "react";
import { CommandPalette, useCommandPalette } from "./CommandPalette";

export default function CommandPaletteMount() {
  const { open, setOpen, closePalette } = useCommandPalette();

  React.useEffect(() => {
    function onCustom() { setOpen(true); }
    window.addEventListener("app:open-command-palette", onCustom);
    return () => window.removeEventListener("app:open-command-palette", onCustom);
  }, [setOpen]);

  return <CommandPalette open={open} onClose={closePalette} />;
}
