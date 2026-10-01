import { roleLabel } from '@/lib/format';
import type { RoomSocket } from '@/lib/socket';
import type { ServerToClientEvents } from '@watchparty/shared';
import type { Notifier } from './notifier';
import type { RoomStore } from './store';

/**
 * The single place server → client events are handled (LLD SP-14). Updates the store, adds
 * system lines to the chat and raises toasts for things that concern the current user.
 * Returns an unbind function. Reactions are handled by the reactions feature (LLD SP-15).
 */
export const bindRoomEvents = (
  socket: RoomSocket,
  store: RoomStore,
  notify: Notifier,
  now: () => number,
): (() => void) => {
  const state = () => store.getState();
  const nameOf = (userId: string): string =>
    state().participants.find((p) => p.userId === userId)?.name ?? 'Someone';
  const isSelf = (userId: string): boolean => state().selfId === userId;

  const h: Required<Omit<ServerToClientEvents, 'reaction'>> = {
    sync_state: (playback) => {
      state().applyPlayback(playback);
    },
    user_joined: ({ username, participants }) => {
      state().setParticipants(participants);
      state().addSystem(`${username} joined`, now());
    },
    user_left: ({ username, reason, participants }) => {
      state().setParticipants(participants);
      state().addSystem(reason === 'timeout' ? `${username} lost connection` : `${username} left`, now());
    },
    presence_changed: ({ participants }) => {
      state().setParticipants(participants);
    },
    role_assigned: ({ userId, username, role, participants }) => {
      state().setParticipants(participants);
      state().addSystem(`${username} is now a ${roleLabel(role).toLowerCase()}`, now());
      if (isSelf(userId)) {
        notify.info(`You are now a ${roleLabel(role).toLowerCase()}.`);
      }
    },
    host_transferred: ({ toUserId, participants }) => {
      state().setParticipants(participants);
      state().setHost(toUserId);
      state().addSystem(`${nameOf(toUserId)} is now the host`, now());
      if (isSelf(toUserId)) {
        notify.success('You are now the host.');
      }
    },
    participant_removed: ({ userId, participants }) => {
      const name = nameOf(userId);
      state().setParticipants(participants);
      state().addSystem(`${name} was removed`, now());
    },
    kicked: () => {
      state().kicked();
    },
    queue_updated: ({ queue }) => {
      state().setQueue(queue);
    },
    action_requested: (request) => {
      state().addRequest(request);
    },
    request_resolved: ({ requestId }) => {
      state().removeRequest(requestId);
    },
    chat_message: (message) => {
      state().addChat(message);
    },
  };

  // Registered one by one: Socket.IO's listener types cannot be forwarded generically without casts.
  socket.on('sync_state', h.sync_state);
  socket.on('user_joined', h.user_joined);
  socket.on('user_left', h.user_left);
  socket.on('presence_changed', h.presence_changed);
  socket.on('role_assigned', h.role_assigned);
  socket.on('host_transferred', h.host_transferred);
  socket.on('participant_removed', h.participant_removed);
  socket.on('kicked', h.kicked);
  socket.on('queue_updated', h.queue_updated);
  socket.on('action_requested', h.action_requested);
  socket.on('request_resolved', h.request_resolved);
  socket.on('chat_message', h.chat_message);

  return () => {
    socket.off('sync_state', h.sync_state);
    socket.off('user_joined', h.user_joined);
    socket.off('user_left', h.user_left);
    socket.off('presence_changed', h.presence_changed);
    socket.off('role_assigned', h.role_assigned);
    socket.off('host_transferred', h.host_transferred);
    socket.off('participant_removed', h.participant_removed);
    socket.off('kicked', h.kicked);
    socket.off('queue_updated', h.queue_updated);
    socket.off('action_requested', h.action_requested);
    socket.off('request_resolved', h.request_resolved);
    socket.off('chat_message', h.chat_message);
  };
};
