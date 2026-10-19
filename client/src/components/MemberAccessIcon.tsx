import { useEffect, useState } from 'react';
import type { AccessParents } from '../lib/channelAccess';
import type { Channel, User } from '../types';
import {
  formatBanTimeLeft,
  isIndefiniteBan,
  isReadOnlyInChannel,
  isUserBanned,
} from '../lib/permissions';
import { IconLock } from './Icons';

interface Props {
  user: User;
  channel?: Channel;
  accessParents?: AccessParents;
}

function useBanTimeLeft(bannedUntil: string | null | undefined): string | null {
  const [timeLeft, setTimeLeft] = useState<string | null>(() =>
    bannedUntil ? formatBanTimeLeft(bannedUntil) : null,
  );

  useEffect(() => {
    if (!bannedUntil || isIndefiniteBan(bannedUntil)) {
      setTimeLeft(null);
      return;
    }

    const update = () => {
      if (!isUserBanned({ bannedUntil })) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft(formatBanTimeLeft(bannedUntil));
    };

    update();
    const remainingMs = new Date(bannedUntil).getTime() - Date.now();
    const intervalMs = remainingMs < 3_600_000 ? 10_000 : 60_000;
    const id = window.setInterval(update, intervalMs);
    return () => window.clearInterval(id);
  }, [bannedUntil]);

  return timeLeft;
}

export function MemberAccessIcon({ user, channel, accessParents }: Props) {
  const banned = isUserBanned(user);
  const timeLeft = useBanTimeLeft(banned ? user.bannedUntil : null);

  if (banned) {
    return (
      <span
        className="member-ban-indicators"
        title={timeLeft ? `Banned — ${timeLeft} left` : 'Banned from server'}
      >
        <span className="access-padlock access-padlock--banned" aria-hidden="true">
          <IconLock />
        </span>
        {timeLeft && <span className="ban-time-left">{timeLeft}</span>}
      </span>
    );
  }

  if (channel && accessParents && isReadOnlyInChannel(channel, user.role, accessParents)) {
    return (
      <span className="access-padlock" title="Read-only in this channel" aria-hidden="true">
        <IconLock />
      </span>
    );
  }

  return null;
}