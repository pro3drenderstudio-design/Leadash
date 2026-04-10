import { Suspense } from "react";
import CreditsClient from "./CreditsClient";
export default function CreditsPage() {
  return <Suspense fallback={null}><CreditsClient /></Suspense>;
}
