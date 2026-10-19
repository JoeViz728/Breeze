import { useMemo, useState, type FormEvent } from 'react';
import type { AccessLevel, Category, Channel, ChannelAccessSetting, ServerInfo } from '../../types';
import { accessParentsFrom, normalizeChannelStoredAccess } from '../../lib/channelAccess';
import { accessLabel, channelAccessLabel, INHERIT_ACCESS_LABEL } from '../../lib/permissions';
import {
  buildSettingsLayoutRows,
  categoryOrderFromSettingsRows,
  layoutFromSettingsRows,
  layoutRowMoveBounds,
  moveLayoutRow,
  sortByPosition,
  type LayoutMoveTarget,
} from '../../lib/channelOrder';
import { ServerPageShell } from '../ServerPageShell';
import { IconChevronDown } from '../Icons';

interface Props {
  server: ServerInfo;
  categories: Category[];
  channels: Channel[];
  onSaveIdentity: (name: string, description: string) => Promise<void>;
  onSaveAccess: (loginDisabled: boolean, loginNotice: string) => Promise<void>;
  onEndSessionsByRole: (role: 'admin' | 'member') => Promise<number>;
  onUpdateChannelLayout: (
    items: Array<{ id: string; categoryId: string | null; position: number }>,
  ) => Promise<void>;
  onReorderCategories: (orderedIds: string[]) => Promise<void>;
  onUpdateCategory: (id: string, data: Partial<Pick<Category, 'readAccess' | 'writeAccess'>>) => Promise<void>;
  onUpdateUncategorizedAccess: (readAccess: AccessLevel, writeAccess: AccessLevel) => Promise<void>;
  onUpdateChannel: (id: string, data: Partial<Channel>) => Promise<void>;
  onCreateCategory: (name: string) => Promise<void>;
  onCreateChannel: (data: { name: string; categoryId?: string | null }) => Promise<void>;
}

export function ServerSettingsPage({
  server,
  categories,
  channels,
  onSaveIdentity,
  onSaveAccess,
  onEndSessionsByRole,
  onUpdateChannelLayout,
  onReorderCategories,
  onUpdateCategory,
  onUpdateUncategorizedAccess,
  onUpdateChannel,
  onCreateCategory,
  onCreateChannel,
}: Props) {
  const [serverName, setServerName] = useState(server.name);
  const [serverDesc, setServerDesc] = useState(server.description);
  const [loginDisabled, setLoginDisabled] = useState(!!server.loginDisabled);
  const [loginNotice, setLoginNotice] = useState(server.loginNotice || '');
  const [identityBusy, setIdentityBusy] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [sessionBusy, setSessionBusy] = useState<'admin' | 'member' | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const sortedCategories = useMemo(() => sortByPosition(categories), [categories]);
  const accessParents = useMemo(() => accessParentsFrom(server, sortedCategories), [server, sortedCategories]);
  const uncategorizedReadAccess = server.uncategorizedReadAccess ?? 'everyone';
  const uncategorizedWriteAccess = server.uncategorizedWriteAccess ?? 'everyone';
  const layoutRows = useMemo(
    () => buildSettingsLayoutRows(sortedCategories, channels),
    [sortedCategories, channels],
  );

  async function handleIdentitySave(e: FormEvent) {
    e.preventDefault();
    setIdentityBusy(true);
    setStatus(null);
    try {
      await onSaveIdentity(serverName.trim(), serverDesc.trim());
      setStatus('Identity saved.');
    } finally {
      setIdentityBusy(false);
    }
  }

  async function handleAccessSave(e: FormEvent) {
    e.preventDefault();
    setAccessBusy(true);
    setStatus(null);
    try {
      await onSaveAccess(loginDisabled, loginNotice.trim());
      setStatus('Access settings saved.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function handleEndSessions(role: 'admin' | 'member') {
    const label = role === 'admin' ? 'admin' : 'member';
    if (!window.confirm(`End all ${label} sessions? Connected ${label}s will be signed out.`)) return;
    setSessionBusy(role);
    setStatus(null);
    try {
      const count = await onEndSessionsByRole(role);
      setStatus(`Ended ${count} ${label} session${count === 1 ? '' : 's'}.`);
    } finally {
      setSessionBusy(null);
    }
  }

  async function moveLayoutItem(target: LayoutMoveTarget, direction: -1 | 1) {
    const nextRows = moveLayoutRow(layoutRows, target, direction);
    if (!nextRows) return;
    setOrderBusy(true);
    try {
      await onUpdateChannelLayout(layoutFromSettingsRows(nextRows));
      await onReorderCategories(categoryOrderFromSettingsRows(nextRows));
    } finally {
      setOrderBusy(false);
    }
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

  async function handleUncategorizedAccessChange(
    field: 'readAccess' | 'writeAccess',
    value: AccessLevel,
  ) {
    const nextRead = field === 'readAccess' ? value : uncategorizedReadAccess;
    const nextWrite = field === 'writeAccess' ? value : uncategorizedWriteAccess;
    await onUpdateUncategorizedAccess(nextRead, nextRead === 'admin' ? 'admin' : nextWrite);
  }

  async function handleCategoryAccessChange(
    category: Category,
    field: 'readAccess' | 'writeAccess',
    value: AccessLevel,
  ) {
    const nextRead = field === 'readAccess' ? value : category.readAccess;
    const nextWrite = field === 'writeAccess' ? value : category.writeAccess;
    await onUpdateCategory(category.id, {
      readAccess: nextRead,
      writeAccess: nextRead === 'admin' ? 'admin' : nextWrite,
    });
  }

  async function handleChannelAccessChange(
    channel: Channel,
    field: 'readAccess' | 'writeAccess',
    value: ChannelAccessSetting,
  ) {
    const nextRead = field === 'readAccess' ? value : channel.readAccess;
    const nextWrite = field === 'writeAccess' ? value : channel.writeAccess;
    const access = normalizeChannelStoredAccess(nextRead, nextWrite);
    await onUpdateChannel(channel.id, access);
  }

  return (
    <ServerPageShell title="Server Settings" subtitle="Manage identity, access, and channel layout">
      {status && <p className="settings-status">{status}</p>}

      <section className="server-page-section settings-section">
        <h3>Identity</h3>
        <form onSubmit={handleIdentitySave}>
          <label className="field-label" htmlFor="settings-server-name">
            Server name
          </label>
          <input
            id="settings-server-name"
            className="admin-input"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
          />
          <label className="field-label" htmlFor="settings-server-desc">
            Server description
          </label>
          <textarea
            id="settings-server-desc"
            className="admin-textarea"
            rows={3}
            value={serverDesc}
            onChange={(e) => setServerDesc(e.target.value)}
          />
          <button type="submit" className="admin-btn" disabled={identityBusy || !serverName.trim()}>
            {identityBusy ? 'Saving…' : 'Save identity'}
          </button>
        </form>
      </section>

      <section className="server-page-section settings-section">
        <h3>Access</h3>
        <form onSubmit={handleAccessSave}>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={loginDisabled}
              onChange={(e) => setLoginDisabled(e.target.checked)}
            />
            <span>Disable login screen</span>
          </label>
          <p className="settings-help">
            When enabled, new joins are blocked and only administrators can sign in with a password.
          </p>
          <label className="field-label" htmlFor="settings-login-notice">
            Notice shown on login screen
          </label>
          <textarea
            id="settings-login-notice"
            className="admin-textarea"
            rows={3}
            placeholder="e.g. Down for maintenance. Back soon."
            value={loginNotice}
            onChange={(e) => setLoginNotice(e.target.value)}
            disabled={!loginDisabled}
          />
          <button type="submit" className="admin-btn" disabled={accessBusy}>
            {accessBusy ? 'Saving…' : 'Save access settings'}
          </button>
        </form>

        <div className="settings-subsection">
          <h4>End sessions by role</h4>
          <p className="settings-help">Sign out connected users without banning them. Your own session is never ended.</p>
          <div className="settings-action-row">
            <button
              type="button"
              className="admin-btn-sm"
              disabled={sessionBusy !== null}
              onClick={() => void handleEndSessions('member')}
            >
              {sessionBusy === 'member' ? 'Ending…' : 'End member sessions'}
            </button>
            <button
              type="button"
              className="admin-btn-danger-sm"
              disabled={sessionBusy !== null}
              onClick={() => void handleEndSessions('admin')}
            >
              {sessionBusy === 'admin' ? 'Ending…' : 'End admin sessions'}
            </button>
          </div>
        </div>
      </section>

      <section className="server-page-section settings-section">
        <h3>Channels &amp; categories</h3>
        <p className="settings-help">
          Reorder channels and categories in one list. Each arrow swaps the row with its neighbor above or below.
          Channels take on the category of the nearest category line above them. Child channels inherit access from
          their parent category or from (Uncategorized), unless overridden.
        </p>

        <form className="admin-inline-form" onSubmit={handleAddCategory}>
          <input
            className="admin-input"
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit" className="admin-btn-sm">Add category</button>
        </form>

        <div className="settings-group settings-group--fluid">
          {layoutRows.map((row, index) =>
            row.kind === 'section' ? (
              row.categoryId === null ? (
                <UncategorizedSectionRow
                  key={`section-uncategorized-${index}`}
                  label={row.label}
                  readAccess={uncategorizedReadAccess}
                  writeAccess={uncategorizedWriteAccess}
                  onAccessChange={(field, value) => void handleUncategorizedAccessChange(field, value)}
                />
              ) : (
                <CategorySectionRow
                  key={`section-${row.categoryId}`}
                  category={sortedCategories.find((category) => category.id === row.categoryId)!}
                  bounds={layoutRowMoveBounds(layoutRows, { type: 'category', id: row.categoryId })}
                  orderBusy={orderBusy}
                  onMove={(direction) => void moveLayoutItem({ type: 'category', id: row.categoryId! }, direction)}
                  onAccessChange={(field, value) =>
                    void handleCategoryAccessChange(
                      sortedCategories.find((category) => category.id === row.categoryId)!,
                      field,
                      value,
                    )
                  }
                />
              )
            ) : (
              <ChannelAccessRow
                key={row.channel.id}
                channel={row.channel}
                accessParents={accessParents}
                bounds={layoutRowMoveBounds(layoutRows, { type: 'channel', id: row.channel.id })}
                orderBusy={orderBusy}
                onMove={(direction) => void moveLayoutItem({ type: 'channel', id: row.channel.id }, direction)}
                onAccessChange={(field, value) => void handleChannelAccessChange(row.channel, field, value)}
              />
            ),
          )}
        </div>

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
            <option value="">(Uncategorized)</option>
            {sortedCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button type="submit" className="admin-btn-sm">Add channel</button>
        </form>
      </section>
    </ServerPageShell>
  );
}

function UncategorizedSectionRow({
  label,
  readAccess,
  writeAccess,
  onAccessChange,
}: {
  label: string;
  readAccess: AccessLevel;
  writeAccess: AccessLevel;
  onAccessChange: (field: 'readAccess' | 'writeAccess', value: AccessLevel) => void;
}) {
  return (
    <div className="settings-channel-row settings-section-row--uncategorized">
      <div className="settings-channel-main">
        <ParentListingLabel name={label} accessHint={accessLabel(readAccess, writeAccess)} />
      </div>
      <AccessControls
        readAccess={readAccess}
        writeAccess={writeAccess}
        onReadChange={(value) => onAccessChange('readAccess', value as AccessLevel)}
        onWriteChange={(value) => onAccessChange('writeAccess', value as AccessLevel)}
      />
    </div>
  );
}

function CategorySectionRow({
  category,
  bounds,
  orderBusy,
  onMove,
  onAccessChange,
}: {
  category: Category;
  bounds: { canMoveUp: boolean; canMoveDown: boolean };
  orderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onAccessChange: (field: 'readAccess' | 'writeAccess', value: AccessLevel) => void;
}) {
  return (
    <div className="settings-channel-row settings-section-row--category">
      <div className="settings-channel-main">
        <div className="settings-order-actions">
          <button
            type="button"
            className="settings-order-btn"
            disabled={orderBusy || !bounds.canMoveUp}
            onClick={() => onMove(-1)}
            aria-label={`Move ${category.name} up`}
          >
            <span className="settings-order-icon settings-order-icon--up"><IconChevronDown /></span>
          </button>
          <button
            type="button"
            className="settings-order-btn"
            disabled={orderBusy || !bounds.canMoveDown}
            onClick={() => onMove(1)}
            aria-label={`Move ${category.name} down`}
          >
            <span className="settings-order-icon"><IconChevronDown /></span>
          </button>
        </div>
        <ParentListingLabel
          name={category.name}
          accessHint={accessLabel(category.readAccess, category.writeAccess)}
        />
      </div>
      <AccessControls
        readAccess={category.readAccess}
        writeAccess={category.writeAccess}
        onReadChange={(value) => onAccessChange('readAccess', value as AccessLevel)}
        onWriteChange={(value) => onAccessChange('writeAccess', value as AccessLevel)}
      />
    </div>
  );
}

function ParentListingLabel({ name, accessHint }: { name: string; accessHint: string }) {
  return (
    <div className="settings-parent-label">
      <span className="settings-row-type">Category</span>
      <span className="settings-category-name">{name}</span>
      <span className="channel-access-hint">{accessHint}</span>
    </div>
  );
}

function AccessControls({
  readAccess,
  writeAccess,
  allowInherit = false,
  onReadChange,
  onWriteChange,
}: {
  readAccess: AccessLevel | ChannelAccessSetting;
  writeAccess: AccessLevel | ChannelAccessSetting;
  allowInherit?: boolean;
  onReadChange: (value: AccessLevel | ChannelAccessSetting) => void;
  onWriteChange: (value: AccessLevel | ChannelAccessSetting) => void;
}) {
  return (
    <div className="settings-channel-access">
      <label className="settings-access-field">
        <span>Read</span>
        <select
          className={`admin-select${readAccess === 'inherit' ? ' admin-select--inherit' : ''}`}
          value={readAccess}
          onChange={(e) => onReadChange(e.target.value as AccessLevel | ChannelAccessSetting)}
        >
          {allowInherit && <option value="inherit">{INHERIT_ACCESS_LABEL}</option>}
          <option value="everyone">Everyone</option>
          <option value="admin">Admins only</option>
        </select>
      </label>
      <label className="settings-access-field">
        <span>Write</span>
        <select
          className={`admin-select${writeAccess === 'inherit' ? ' admin-select--inherit' : ''}`}
          value={writeAccess}
          onChange={(e) => onWriteChange(e.target.value as AccessLevel | ChannelAccessSetting)}
          disabled={readAccess === 'admin'}
        >
          {allowInherit && <option value="inherit">{INHERIT_ACCESS_LABEL}</option>}
          <option value="everyone">Everyone</option>
          <option value="admin">Admins only</option>
        </select>
      </label>
    </div>
  );
}

function ChannelAccessRow({
  channel,
  accessParents,
  bounds,
  orderBusy,
  onMove,
  onAccessChange,
}: {
  channel: Channel;
  accessParents: ReturnType<typeof accessParentsFrom>;
  bounds: { canMoveUp: boolean; canMoveDown: boolean };
  orderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onAccessChange: (field: 'readAccess' | 'writeAccess', value: ChannelAccessSetting) => void;
}) {
  return (
    <div className="settings-channel-row">
      <div className="settings-channel-main">
        <div className="settings-order-actions">
          <button
            type="button"
            className="settings-order-btn"
            disabled={orderBusy || !bounds.canMoveUp}
            onClick={() => onMove(-1)}
            aria-label={`Move #${channel.name} up`}
          >
            <span className="settings-order-icon settings-order-icon--up"><IconChevronDown /></span>
          </button>
          <button
            type="button"
            className="settings-order-btn"
            disabled={orderBusy || !bounds.canMoveDown}
            onClick={() => onMove(1)}
            aria-label={`Move #${channel.name} down`}
          >
            <span className="settings-order-icon"><IconChevronDown /></span>
          </button>
        </div>
        <span className="settings-channel-name">
          #{channel.name}
          <span className="channel-access-hint">{channelAccessLabel(channel, accessParents)}</span>
        </span>
      </div>
      <AccessControls
        readAccess={channel.readAccess}
        writeAccess={channel.writeAccess}
        allowInherit
        onReadChange={(value) => onAccessChange('readAccess', value as ChannelAccessSetting)}
        onWriteChange={(value) => onAccessChange('writeAccess', value as ChannelAccessSetting)}
      />
    </div>
  );
}