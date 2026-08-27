const STORAGE_KEY = "ruang-cerita:student-id";

export function getStudentLocalId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStudentLocalId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
