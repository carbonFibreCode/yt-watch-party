import { useState } from 'react';
import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { ParticipantList } from '@/features/participants/ParticipantList';
import { QueuePanel } from '@/features/queue/QueuePanel';
import { RequestsPanel } from '@/features/requests/RequestsPanel';
import { PermissionPolicy } from '@watchparty/shared';
import { useRoom, useRoomStore } from './RoomContext';
import { selectSelf } from './store';

type SidebarTab = 'people' | 'chat' | 'queue' | 'requests';
const TABS: readonly string[] = ['people', 'chat', 'queue', 'requests'] satisfies SidebarTab[];
const isTab = (value: string): value is SidebarTab => TABS.includes(value);

/** People, chat (with an unread badge), the queue and, for staff, pending requests. */
export function RoomSidebar(): ReactElement {
  const store = useRoomStore();
  const [tab, setTab] = useState<SidebarTab>('people');
  const peopleCount = useRoom((s) => s.participants.length);
  const queueCount = useRoom((s) => s.queue.length);
  const requestCount = useRoom((s) => s.requests.length);
  const unreadChat = useRoom((s) => s.unreadChat);
  const isStaff = useRoom((s) => {
    const self = selectSelf(s);
    return self !== undefined && PermissionPolicy.isStaff(self.role);
  });

  // A demoted moderator loses the Requests tab; fall back instead of showing nothing.
  const shown: SidebarTab = tab === 'requests' && !isStaff ? 'people' : tab;

  const select = (value: string): void => {
    if (isTab(value)) {
      setTab(value);
      store.getState().setChatOpen(value === 'chat');
    }
  };

  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <Tabs value={shown} onValueChange={select}>
          <TabsList className="w-full">
            <TabsTrigger value="people">
              People <Badge variant="secondary">{peopleCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="chat">
              Chat
              {unreadChat > 0 && <Badge aria-label={`${String(unreadChat)} unread`}>{unreadChat}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="queue">
              Queue {queueCount > 0 && <Badge variant="secondary">{queueCount}</Badge>}
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
          <TabsContent value="chat" className="mt-3">
            <ChatPanel />
          </TabsContent>
          <TabsContent value="queue" className="mt-3">
            <QueuePanel />
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
