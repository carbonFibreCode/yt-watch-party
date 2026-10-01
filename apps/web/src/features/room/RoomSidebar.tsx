import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ParticipantList } from '@/features/participants/ParticipantList';
import { RequestsPanel } from '@/features/requests/RequestsPanel';
import { PermissionPolicy } from '@watchparty/shared';
import { useRoom } from './RoomContext';
import { selectSelf } from './store';

/** People and, for staff, pending requests. Chat and queue join these tabs in Phase 11. */
export function RoomSidebar(): ReactElement {
  const peopleCount = useRoom((s) => s.participants.length);
  const requestCount = useRoom((s) => s.requests.length);
  const isStaff = useRoom((s) => {
    const self = selectSelf(s);
    return self !== undefined && PermissionPolicy.isStaff(self.role);
  });

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <Tabs defaultValue="people">
          <TabsList className="w-full">
            <TabsTrigger value="people">
              People <Badge variant="secondary">{peopleCount}</Badge>
            </TabsTrigger>
            {isStaff && (
              <TabsTrigger value="requests">
                Requests {requestCount > 0 && <Badge>{requestCount}</Badge>}
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="people" className="mt-3">
            <ParticipantList />
          </TabsContent>
          {isStaff && (
            <TabsContent value="requests" className="mt-3">
              <RequestsPanel />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
