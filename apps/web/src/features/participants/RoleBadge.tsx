import { Crown, Eye, Shield } from 'lucide-react';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { roleLabel } from '@/lib/format';
import type { Role } from '@watchparty/shared';

const ICONS: Partial<Record<Role, ReactElement>> = {
  host: <Crown />,
  moderator: <Shield />,
  viewer: <Eye />,
};

/** Role with an icon, so role is never conveyed by color alone (rules.md §9.6). */
export function RoleBadge({ role }: { readonly role: Role }): ReactElement {
  return (
    <Badge variant={role === 'host' ? 'default' : 'secondary'} className="gap-1">
      {ICONS[role]}
      {roleLabel(role)}
    </Badge>
  );
}
