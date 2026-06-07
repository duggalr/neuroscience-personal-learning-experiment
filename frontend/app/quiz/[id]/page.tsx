import { QuizClient } from "@/components/QuizClient";

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { id } = await params;
  const { review } = await searchParams;
  return <QuizClient conceptId={id} review={review === "1"} />;
}
