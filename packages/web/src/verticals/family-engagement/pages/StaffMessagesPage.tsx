/**
 * Staff Messages Page
 *
 * Inbox where admins, coordinators and assigned caregivers answer family
 * conversations. Visibility (org-wide / branch / assigned-only) is enforced by
 * the API; this page only renders what the server returns.
 */

import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useStaffInbox,
  useMessagesInThread,
  useSendMessage,
  useUpdateMessageThread,
} from '../hooks';
import { MessageThread, MessageComposer } from '../components';

type StatusFilter = 'OPEN' | 'CLOSED';

export const StaffMessagesPage: React.FC = () => {
  const { threadId } = useParams<{ threadId: string }>();
  const [status, setStatus] = useState<StatusFilter>('OPEN');

  const { data: threads, isLoading: threadsLoading } = useStaffInbox(status);
  const { data: messages, isLoading: messagesLoading } = useMessagesInThread(threadId ?? null);
  const sendMessage = useSendMessage();
  const updateThread = useUpdateMessageThread();

  const activeThread = threads?.find((t) => t.id === threadId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="mt-1 text-gray-600">Conversations with client families</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex gap-2" role="tablist" aria-label="Conversation status">
              {(['OPEN', 'CLOSED'] as const).map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={status === s}
                  onClick={() => setStatus(s)}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${
                    status === s ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {s === 'OPEN' ? 'Open' : 'Closed'}
                </button>
              ))}
            </div>

            {threadsLoading ? (
              <p className="py-6 text-center text-sm text-gray-500">Loading conversations…</p>
            ) : !threads || threads.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No {status.toLowerCase()} conversations</p>
            ) : (
              <ul className="space-y-2">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <Link
                      to={`/messages/${thread.id}`}
                      className={`block rounded-lg border p-3 hover:bg-gray-50 ${
                        thread.id === threadId ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">{thread.subject}</p>
                        {thread.unreadCountStaff > 0 && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                            {thread.unreadCountStaff}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-600">
                        {thread.familyMemberName} ({thread.familyMemberRelationship.toLowerCase()})
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {new Date(thread.lastMessageAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {thread.priority === 'HIGH' && (
                          <span className="ml-2 font-semibold text-red-600">High priority</span>
                        )}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="lg:col-span-2">
          {threadId ? (
            <div className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 p-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {activeThread?.subject ?? 'Conversation'}
                  </h2>
                  {activeThread && (
                    <p className="text-xs text-gray-600">
                      with {activeThread.familyMemberName} ({activeThread.familyMemberRelationship.toLowerCase()})
                    </p>
                  )}
                </div>
                {activeThread && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {activeThread.assignedToUserId ? 'Assigned' : 'Unassigned'}
                    </span>
                    <button
                      onClick={() =>
                        updateThread.mutate({
                          threadId: activeThread.id,
                          changes: { status: activeThread.status === 'OPEN' ? 'CLOSED' : 'OPEN' },
                        })
                      }
                      disabled={updateThread.isPending}
                      className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {activeThread.status === 'OPEN' ? 'Close conversation' : 'Reopen'}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-y-auto" style={{ maxHeight: '500px' }}>
                <MessageThread messages={messages || []} loading={messagesLoading} viewer="STAFF" />
              </div>
              <MessageComposer
                onSend={(messageText) => sendMessage.mutate({ threadId, messageText })}
                disabled={sendMessage.isPending || activeThread?.status === 'CLOSED'}
                placeholder="Reply to the family…"
              />
            </div>
          ) : (
            <div className="flex h-96 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
              <p>Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
