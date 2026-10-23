import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
      EvidenceChase
    </Link>
  );
}
