/**
 * v2-app barrel — one import surface for everything in the kit.
 *
 *   import { Button, Card, DataTable, AppShell, Icon, ... } from "@/v2-app";
 *
 * Keeps screen files clean and lets us refactor internal module layout
 * without touching consumers.
 */

export * from "./primitives";
export * from "./nav";
export { AppShell } from "./AppShell";
export { CommandPalette, useCommandPalette, type CommandItem } from "./CommandPalette";
export * as Icons from "./icons";
