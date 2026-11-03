import Image from "next/image";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function EmptyState({
  image,
  title,
  description,
  action,
}: {
  image: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <Image
          src={image}
          alt=""
          width={320}
          height={220}
          className="mx-auto h-auto w-full max-w-xs"
        />
        <p className="mt-4 text-base font-medium text-slate-900">{title}</p>
        <p className="mt-1 text-base text-slate-500">{description}</p>
        {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
