import { Suspense } from "react";
import CrmClient from "./CrmClient";
export default function CrmPage() {
  return <Suspense><CrmClient /></Suspense>;
}
