import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type AuthInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  icon?: ReactNode;
  accent?: "primary" | "tertiary";
};

export function AuthInput({
  label,
  name,
  icon,
  accent = "primary",
  className,
  ...props
}: AuthInputProps) {
  const focusClasses =
    accent === "tertiary"
      ? "focus:border-tertiary focus:shadow-[0_0_0_4px_rgba(0,104,116,0.15)]"
      : "focus:border-primary focus:shadow-[0_0_0_4px_rgba(0,93,167,0.12)]";

  return (
    <label className="flex flex-col gap-1.5 text-label-md font-semibold text-on-surface">
      {label}
      <div className="relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant"
          >
            {icon}
          </span>
        )}
        <input
          name={name}
          className={cn(
            "w-full rounded-xl border-2 border-transparent bg-surface-container-low py-3 text-body-md text-on-surface outline-none transition-all",
            "placeholder:text-on-surface-variant/60",
            "focus:bg-surface-container-lowest",
            focusClasses,
            icon ? "pl-11 pr-4" : "px-4",
            className,
          )}
          {...props}
        />
      </div>
    </label>
  );
}
