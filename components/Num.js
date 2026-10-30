// A big number in short form (1M, 250.4M); the exact number shows on hover
import { compact, fmt } from '@/lib/format';

export default function Num({ n }) {
  return <span title={fmt(n)}>{compact(n)}</span>;
}
