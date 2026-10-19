import { useState, FormEvent } from 'react';
import type { Category, Channel, ChannelAccessSetting, ServerInfo, User } from '../types';
import { accessParentsFrom, normalizeChannelStoredAccess } from '../lib/channelAccess';
import { channelAccessLabel, INHERIT_ACCESS_LABEL } from '../lib/permissions';
import { MemberMenu } from './MemberMenu';
import { IconX } from './Icons';

interface Props {
  server: ServerInfo;
  categories: Category[];
  channels: Channel[];
  users: User[];
  currentUserId: string;
  onClose: () => void;
  onUpdateServer: (name: string, description: string) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onCreateChannel: (data: { name: string; categoryId?: string | null }) => Promise<void>;
  onUpdateChannel: (id: string, data: Partial<Channel>) => Promise<void>;
  onDeleteChannel: (id: string) => Promise<void>;
  onEndSession: (id: string) => Promise<void>;
  onBanUser: (id: string) => Promise<void>;
  onTimeoutUser: (id: string, minutes: number) => Promise<void>;
  onUnbanUser: (id: string) => Promise<void>;
}

type AdminTab = 'server' | 'channels' | 'members';

export function AdminPanel({
  server,
  categories,
  channels,
  users,
  currentUserId,
  onClose,
  onUpdateServer,
  onCreateCategory,
  onDeleteCategory,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onEndSession,
  onBanUser,
  onTimeoutUser,
  onUnbanUser,
}: Props) {
  const [tab, setTab] = useState<AdminTab>('server');
  const [serverName, setServerName] = useState(server.name);
  const [serverDesc, setServerDesc] = useState(server.description);
  const [newCategory, setNewCategory] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editReadAccess, setEditReadAccess] = useState<ChannelAccessSetting>('inherit');
  const [editWriteAccess, setEditWriteAccess] = useState<ChannelAccessSetting>('inherit');
  const accessParents = accessParentsFrom(server, categories);

  async function handleServerSave(e: FormEvent) {
    e.preventDefault();
    await onUpdateServer(serverName.trim(), serverDesc.trim());
  }

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    if (!newCategory.trim()) return;
    await onCreateCategory(newCategory.trim());
    setNewCategory('');
  }

  async function handleAddChannel(e: FormEvent) {
    e.preventDefault();
    if (!newChannel.trim()) return;
    await onCreateChannel({
      name: newChannel.trim(),
      categoryId: newChannelCategory || null,
    });
    setNewChannel('');
  }

  function startEditChannel(ch: Channel) {
    setEditingChannel(ch.id);
    setEditTopic(ch.topic);
    setEditDesc(ch.description);
    setEditReadAccess(ch.readAccess);
    setEditWriteAccess(ch.writeAccess);
  }

  async function saveChannelEdit(id: string) {
    const access = normalizeChannelStoredAccess(editReadAccess, editWriteAccess);
    await onUpdateChannel(id, {
      topic: editTopic,
      description: editDesc,
      readAccess: access.readAccess,
      writeAccess: access.writeAccess,
    });
    setEditingChannel(null);
  }

  const isBanned = (u: User) => u.bannedUntil && new Date(u.bannedUntil).getTime() > Date.now();

  return (
    <aside className="right-panel">
      <div className="panel-header">
        <h3>Server Admin</h3>
        <button className="panel-close" onClick={onClose} title="Close panel">
          <IconX />
        </button>
      </div>

      <div className="admin-tabs">
        {(['server', 'channels', 'members'] as AdminTab[]).map((t) => (
          <button
            key={t}
            className={`admin-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'server' ? 'Server' : t === 'channels' ? 'Channels' : 'Members'}
          </button>
        ))}
      </div>

      <div className="panel-content">
        {tab === 'server' && (
          <form onSubmit={handleServerSave}>
            <div className="panel-section">
              <h4>Server name</h4>
              <input
                className="admin-input"
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
              />
            </div>
            <div className="panel-section">
              <h4>Description</h4>
              <textarea
                className="admin-textarea"
                value={serverDesc}
                onChange={(e) => setServerDesc(e.target.value)}
                rows={3}
              />
            </div>
            <button type="submit" className="admin-btn">Save settings</button>
          </form>
        )}

        {tab === 'channels' && (
          <>
            <form className="admin-inline-form" onSubmit={handleAddCategory}>
              <input
                className="admin-input"
                placeholder="New category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="submit" className="admin-btn-sm">Add</button>
            </form>

            {categories.map((cat) => (
              <div key={cat.id} className="admin-list-item">
                <span className="admin-category-name">{cat.name}</span>
                <button className="admin-btn-danger-sm" onClick={() => onDeleteCategory(cat.id)}>
                  Delete
                </button>
              </div>
            ))}

            <div className="panel-section">
              <h4>Channels</h4>
              <form className="admin-inline-form" onSubmit={handleAddChannel}>
                <input
                  className="admin-input"
                  placeholder="New channel name"
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                />
                <select
                  className="admin-select"
                  value={newChannelCategory}
                  onChange={(e) => setNewChannelCategory(e.target.value)}
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button type="submit" className="admin-btn-sm">Add</button>
              </form>

              {channels.map((ch) => (
                <div key={ch.id} className="admin-channel-row">
                  <div className="admin-channel-header">
                    <span>
                      #{ch.name}{' '}
                      <span className="channel-access-hint">{channelAccessLabel(ch, accessParents)}</span>
                    </span>
                    <div className="admin-channel-actions">
                      <button className="admin-btn-sm" onClick={() => startEditChannel(ch)}>Edit</button>
                      <button className="admin-btn-danger-sm" onClick={() => onDeleteChannel(ch.id)}>Delete</button>
                    </div>
                  </div>
                  {editingChannel === ch.id && (
                    <div className="admin-channel-edit">
                      <input
                        className="admin-input"
                        placeholder="Topic"
                        value={editTopic}
                        onChange={(e) => setEditTopic(e.target.value)}
                      />
                      <textarea
                        className="admin-textarea"
                        placeholder="Description"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        rows={2}
                      />
                      <label className="field-label">Who can read</label>
                      <select
                        className="admin-select"
                        value={editReadAccess}
                        onChange={(e) => setEditReadAccess(e.target.value as ChannelAccessSetting)}
                      >
                        <option value="inherit">{INHERIT_ACCESS_LABEL}</option>
                        <option value="everyone">Everyone</option>
                        <option value="admin">Admins only</option>
                      </select>
                      <label className="field-label">Who can write</label>
                      <select
                        className="admin-select"
                        value={editWriteAccess}
                        onChange={(e) => setEditWriteAccess(e.target.value as ChannelAccessSetting)}
                        disabled={editReadAccess === 'admin'}
                      >
                        <option value="inherit">{INHERIT_ACCESS_LABEL}</option>
                        <option value="everyone">Everyone</option>
                        <option value="admin">Admins only (read-only for members)</option>
                      </select>
                      <button className="admin-btn-sm" onClick={() => saveChannelEdit(ch.id)}>Save</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'members' && (
          <div className="panel-section">
            <h4>All members ({users.length})</h4>
            {users.map((u) => (
              <div key={u.id} className="admin-member-row">
                <div className="member-item member-item--spread">
                  <div className="member-avatar" style={{ background: u.avatarColor }}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className="member-name">{u.username}</span>
                  {u.role === 'admin' && <span className="admin-badge">Admin</span>}
                  {isBanned(u) && <span className="banned-badge">Banned</span>}
                  {u.id !== currentUserId && (
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
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}