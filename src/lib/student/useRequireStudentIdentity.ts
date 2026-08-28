"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStudentLocalId } from "./identity";

export function useRequireStudentIdentity(): string | null {
  const router = useRouter();
  const [studentLocalId, setStudentLocalId] = useState<string | null>(null);

  useEffect(() => {
    const id = getStudentLocalId();
    if (!id) {
      router.replace("/student");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferring a client-only localStorage read to avoid a server/client hydration mismatch; not a cascading-render risk (fires once per mount)
    setStudentLocalId(id);
  }, [router]);

  return studentLocalId;
}
