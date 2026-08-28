import { TransferScreen } from "@/components/kader/TransferScreen";

export default async function KaderAlihkanPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <TransferScreen sessionId={sessionId} />;
}
