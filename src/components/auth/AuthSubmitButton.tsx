"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";

type AuthSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  loadingText?: string;
  accent?: "primary" | "tertiary";
  icon?: ReactNode;
};

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-current"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function AuthSubmitButton({
  children,
  loadingText = "Sedang memproses...",
  accent = "primary",
  icon,
  className,
  disabled,
  ...props
}: AuthSubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  const accentStyles =
    accent === "tertiary"
      ? "bg-tertiary text-on-tertiary shadow-tertiary/25 hover:bg-tertiary/90 hover:shadow-tertiary/35 focus-visible:ring-tertiary"
      : "bg-primary text-on-primary shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/35 focus-visible:ring-primary";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      className={cn(
        "group relative flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 px-4 text-base font-semibold shadow-md transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.99]",
        accentStyles,
        isDisabled &&
          "cursor-not-allowed opacity-70 shadow-none hover:shadow-none active:scale-100",
        className,
      )}
      {...props}
    >
      {pending ? (
        <>
          <Spinner />
          <span>{loadingText}</span>
        </>
      ) : (
        <>
          <span>{children}</span>
          {icon && (
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-0.5"
            >
              {icon}
            </span>
          )}
        </>
      )}
    </button>
  );
}
