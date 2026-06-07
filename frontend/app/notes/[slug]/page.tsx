import { NoteReader } from "@/components/NoteReader";

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <NoteReader noteId={slug} />;
}
