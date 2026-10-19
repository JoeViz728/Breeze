import type { User } from '../../types';
import { isMemberOnline, isUserBanned } from '../../lib/permissions';
import { MemberAccessIcon } from '../MemberAccessIcon';
import { MemberMenu } from '../MemberMenu';
import { ServerPageShell } from '../ServerPageShell';

interface Props {
  users: User[];
  isAdmin: boolean;
  currentUserId: string;
  onEndSession?: (id: string) => void | Promise<void>;
  onBanUser?: (id: string) => void | Promise<void>;
  onTimeoutUser?: (id: string, minutes: number) => void | Promise<void>;
  onUnbanUser?: (id: string) => void | Promise<void>;
}

export function ServerMembersPage({
  users,
  isAdmin,
  currentUserId,
  onEndSession,
  onBanUser,
  onTimeoutUser,
  onUnbanUser,
}: Props) {
  const online = users.filter((u) => isMemberOnline(u));
  const offline = users.filter((u) => !isMemberOnline(u));

  return (
    <ServerPageShell title="Members" subtitle={`${users.length} people on this server`}>
      <MemberSection title={`Online — ${online.length}`} users={online} isAdmin={isAdmin} currentUserId={currentUserId} onEndSession={onEndSession} onBanUser={onBanUser} onTimeoutUser={onTimeoutUser} onUnbanUser={onUnbanUser} />
      <MemberSection title={`Offline — ${offline.length}`} users={offline} isAdmin={isAdmin} currentUserId={currentUserId} onEndSession={onEndSession} onBanUser={onBanUser} onTimeoutUser={onTimeoutUser} onUnbanUser={onUnbanUser} />
    </ServerPageShell>
  );
}

function MemberSection({
  title,
  users,
  isAdmin,
  currentUserId,
  onEndSession,
  onBanUser,
  onTimeoutUser,
  onUnbanUser,
}: {
  title: string;
  users: User[];
  isAdmin: boolean;
  currentUserId: string;
  onEndSession?: (id: string) => void | Promise<void>;
  onBanUser?: (id: string) => void | Promise<void>;
  onTimeoutUser?: (id: string, minutes: number) => void | Promise<void>;
  onUnbanUser?: (id: string) => void | Promise<void>;
}) {
  if (users.length === 0) return null;
  return (
    <section className="server-page-section">
      <h3>{title}</h3>
      {users.map((u) => (
        <div
          key={u.id}
          className={`member-item member-item--spread server-member-row${isUserBanned(u) ? ' member-item--banned' : ''}`}
        >
          <div className="member-avatar" style={{ background: u.avatarColor }}>
            {u.username[0].toUpperCase()}
          </div>
          <span className="member-name">{u.username}</span>
          {u.role === 'admin' && <span className="admin-badge">Admin</span>}
          <MemberAccessIcon user={u} />
          {!isUserBanned(u) && (
            <span className={`member-status ${isMemberOnline(u) ? 'online' : u.status}`} />
          )}
          {isAdmin && onEndSession && u.id !== currentUserId && (
            <MemberMenu
              user={u}
              currentUserId={currentUserId}
              onEndSession={onEndSession}
              onBan={onBanUser}
              onTimeout={onTimeoutUser}
              onUnban={onUnbanUser}
            />
          )}
        </div>
      ))}
    </section>
  );
}