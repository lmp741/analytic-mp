import { cn } from "@/lib/utils/cn";
import { type ReactNode } from "react";

export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
