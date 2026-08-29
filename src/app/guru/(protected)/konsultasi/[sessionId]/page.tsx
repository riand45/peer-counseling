import { ConsultationDetailScreen } from "@/components/guru/ConsultationDetailScreen";

export default async function GuruConsultationDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConsultationDetailScreen sessionId={sessionId} />;
}
