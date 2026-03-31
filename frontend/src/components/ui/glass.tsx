import React from "react";
import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type GlassButtonVariant = "primary" | "outline" | "ghost";

type GlassButtonProps = Omit<React.ComponentProps<typeof BaseButton>, "variant"> & {
  variant?: GlassButtonVariant;
};

const variantMap = {
  primary: "default",
  outline: "outline",
  ghost: "ghost",
} as const;

export function Button({ variant = "primary", className, ...props }: GlassButtonProps) {
  return (
    <BaseButton
      variant={variantMap[variant]}
      className={cn(
        "h-10 rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10",
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.45)]",
        className
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm tracking-wide text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20",
        className
      )}
      {...props}
    />
  );
}
