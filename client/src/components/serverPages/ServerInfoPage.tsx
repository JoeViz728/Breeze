import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { isMemberOnline } from '../../lib/permissions';
import type { ServerStats, User } from '../../types';
import { ServerPageShell } from '../ServerPageShell';

interface Props {
  users: User[];
  messageActivity: number;
}

const STATS_POLL_MS = 15_000;

function formatUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day > 0) return `${day}d ${hr % 24}h`;
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m`;
  return `${sec}s`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPeakHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', hour12: true });
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(ms / 3_600_000);
  return `${hr}h`;
}

export function ServerInfoPage({ users, messageActivity }: Props) {
  const api = useApi();
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [uptimeMs, setUptimeMs] = useState(0);

  const refreshStats = useCallback(() => {
    api.getServerStats().then(setStats).catch(() => {});
  }, [api]);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, STATS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshStats]);

  useEffect(() => {
    refreshStats();
  }, [messageActivity, refreshStats]);

  useEffect(() => {
    if (!stats?.serverStartedAt) return;
    const started = new Date(stats.serverStartedAt).getTime();
    const tick = () => setUptimeMs(Date.now() - started);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [stats?.serverStartedAt]);

  const membersOnline = users.filter(isMemberOnline).length;

  return (
    <ServerPageShell
      title="Server Overview"
      subtitle="Server-wide information and statistics."
    >
      {stats ? (
        <>
          <section className="server-info-rows">
            <div className="server-info-row">
              <span className="server-info-label">Server name</span>
              <span className="server-info-value">{stats.server.name}</span>
            </div>
            <div className="server-info-row">
              <span className="server-info-label">Description</span>
              <span className="server-info-value">{stats.server.description || '—'}</span>
            </div>
            <div className="server-info-row">
              <span className="server-info-label">Date started</span>
              <span className="server-info-value">{formatDate(stats.server.createdAt)}</span>
            </div>
            <div className="server-info-row">
              <span className="server-info-label">Owner</span>
              <span className="server-info-value">{stats.server.owner?.username ?? '—'}</span>
            </div>
          </section>

          <section className="server-page-section">
            <h3>Stats</h3>
            <div className="stats-grid">
              <div className="stat-card stat-card--live">
                <span className="stat-value">{formatUptime(uptimeMs)}</span>
                <span className="stat-label">Uptime</span>
              </div>
              <div className="stat-card stat-card--live">
                <span className="stat-value">{membersOnline}</span>
                <span className="stat-label">Members online</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.messageCount.toLocaleString()}</span>
                <span className="stat-label">Message count</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.topYapper ? `@${stats.topYapper.username}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.topYapper
                    ? `Top yapper · ${stats.topYapper.messageCount.toLocaleString()} msgs`
                    : 'Top yapper'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.mostPopularChannel ? `#${stats.mostPopularChannel.name}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.mostPopularChannel
                    ? `Most popular channel · ${stats.mostPopularChannel.messageCount.toLocaleString()} msgs`
                    : 'Most popular channel'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.peakHour ? formatPeakHour(stats.peakHour.hour) : '—'}
                </span>
                <span className="stat-label">
                  {stats.peakHour
                    ? `Peak hour · ${stats.peakHour.messageCount.toLocaleString()} msgs`
                    : 'Peak hour'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{stats.topWord ? stats.topWord.word : '—'}</span>
                <span className="stat-label">
                  {stats.topWord
                    ? `Top word · ${stats.topWord.count.toLocaleString()} uses`
                    : 'Top word'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.mainCharacter ? `@${stats.mainCharacter.username}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.mainCharacter
                    ? `Main character · ${stats.mainCharacter.mentionCount.toLocaleString()} mentions`
                    : 'Main character'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.pingAbuser ? `@${stats.pingAbuser.username}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.pingAbuser
                    ? `Ping abuser · ${stats.pingAbuser.mentionCount.toLocaleString()} pings`
                    : 'Ping abuser'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.novelAuthor ? `@${stats.novelAuthor.username}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.novelAuthor
                    ? `Novel author · ${stats.novelAuthor.charCount.toLocaleString()} chars`
                    : 'Novel author'}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-value">
                  {stats.speedReplyDemon ? `@${stats.speedReplyDemon.username}` : '—'}
                </span>
                <span className="stat-label">
                  {stats.speedReplyDemon
                    ? `Speed reply demon · ${formatDuration(stats.speedReplyDemon.avgMs)} avg`
                    : 'Speed reply demon'}
                </span>
              </div>
            </div>
          </section>

          <footer className="server-info-plug">
            <span className="server-info-plug-label">Powered by</span>
            <span className="server-info-plug-brand">Breeze</span>
            <span className="server-info-plug-tagline">A calm space to chat.</span>
          </footer>
        </>
      ) : (
        <p className="empty-state">Loading server stats…</p>
      )}
    </ServerPageShell>
  );
}