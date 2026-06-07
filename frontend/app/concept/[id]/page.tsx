import { ConceptView } from "@/components/ConceptView";

export default async function ConceptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConceptView conceptId={id} />;
}
