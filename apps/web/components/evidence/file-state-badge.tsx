import type { EvidenceFileDto } from '@evidencechase/shared';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/** Where a file is in the pipeline: being checked, accepted into evidence, or refused. */
export function FileStateBadge({ file }: { file: EvidenceFileDto }) {
  switch (file.state) {
    case 'VERIFIED':
      return (
        <Badge tone="success">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          {file.scanStatus === 'NO_THREATS_FOUND' ? 'Scanned clean' : 'Verified'}
        </Badge>
      );
    case 'REJECTED':
      return (
        <Badge tone="danger">
          <ShieldAlert className="h-3 w-3" aria-hidden />
          Not accepted
        </Badge>
      );
    default:
      return (
        <Badge tone="info">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Checking for malware…
        </Badge>
      );
  }
}
