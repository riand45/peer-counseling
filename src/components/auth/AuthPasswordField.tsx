"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";


function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61C3.35 8.44 1 12 1 12s4 7 11 7a9.26 9.26 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

type AuthPasswordFieldProps = {
  label?: string;
  name: string;
  required?: boolean;
  minLength?: number;
  hint?: string;
  accent?: "primary" | "tertiary";
};

export function AuthPasswordField({
  label = "Password",
  name,
  required,
  minLength,
  hint,
  accent = "primary",
}: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const focusClasses =
    accent === "tertiary"
      ? "focus:border-tertiary focus:shadow-[0_0_0_4px_rgba(0,104,116,0.15)]"
      : "focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,93,167,0.12)]";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label-md font-semibold text-on-surface">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          placeholder="••••••••"
          className={cn(
            "w-full rounded-xl border-2 border-transparent bg-surface-container-low pl-4 pr-12 py-3",
            "text-body-md text-on-surface outline-none transition-all placeholder:text-on-surface-variant/60",
            "focus:bg-surface-container-lowest",
            focusClasses,
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          aria-pressed={visible}
          className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && <p className="text-label-sm font-normal text-on-surface-variant">{hint}</p>}
    </div>
  );
}
