import { listClasses } from "@/lib/db/queries";
import { NewAssessmentForm } from "./_components/NewAssessmentForm";

// Reads the database on every request: this list must never be served from a
// static render, or a class or assessment added later would not show up.
export const dynamic = "force-dynamic";

export default function NewAssessmentPage() {
  return <NewAssessmentForm classes={listClasses()} />;
}
