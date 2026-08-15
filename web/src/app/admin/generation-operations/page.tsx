import { redirect } from "next/navigation";

export default async function GenerationOperationsPage() {
    redirect("/admin?section=generationOperations");
}
