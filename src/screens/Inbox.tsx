import { InboxList, MarkAllRead } from './parts/InboxList';
import { useInbox } from '../sync/inbox';

/**
 * Inbox: reactions, invites to groups and fichas sent to you (answered right here), a
 * friend who used your invite or added your ficha, answers to your messages. 30 days.
 * On the computer the bell opens the same list in a panel; this page stays for the phone
 * and for the notifications that point here.
 */
export default function Inbox() {
  const inbox = useInbox();
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Avisos</h1>
          <p className="page-sub">Convites, fichas, reações e amigos dos últimos 30 dias.</p>
        </div>
        <MarkAllRead unread={inbox.unread} />
      </header>
      <div className="hb-widget">
        <InboxList inbox={inbox} />
      </div>
    </>
  );
}
