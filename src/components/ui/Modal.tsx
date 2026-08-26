"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-sm rounded-xl bg-surface-container-lowest p-md shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 text-on-surface-variant"
        >
          ✕
        </button>
        <h2 id="modal-title" className="text-headline-md font-semibold text-on-surface">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
