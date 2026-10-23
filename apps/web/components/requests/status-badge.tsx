import { STATUS_LABELS, type RequestStatus } from '@evidencechase/shared';
import { Badge, type BadgeTone } from '@/components/ui/badge';

const STATUS_TONES: Record<RequestStatus, BadgeTone> = {
  PENDING: 'neutral',
  SUBMITTED: 'info',
  CHANGES_REQUESTED: 'warning',
  ACCEPTED: 'success',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}
