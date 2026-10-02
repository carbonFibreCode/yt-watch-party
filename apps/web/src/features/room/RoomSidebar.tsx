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
/** On wide screens long lists scroll inside the card; chat manages its own scrolling. */
const SCROLLING_PANEL = 'mt-3 lg:min-h-0 lg:overflow-y-auto';

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
    <Card className="py-4 lg:min-h-0 lg:flex-1">
      <CardContent className="px-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        <Tabs value={shown} onValueChange={select} className="lg:min-h-0 lg:flex-1">
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
          <TabsContent value="people" className={SCROLLING_PANEL}>
            <ParticipantList />
          </TabsContent>
          <TabsContent value="chat" className="mt-3 lg:flex lg:min-h-0 lg:flex-col">
            <ChatPanel />
          </TabsContent>
          <TabsContent value="queue" className={SCROLLING_PANEL}>
            <QueuePanel />
          </TabsContent>
          {isStaff && (
            <TabsContent value="requests" className={SCROLLING_PANEL}>
              <RequestsPanel />
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
