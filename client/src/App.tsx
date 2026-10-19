import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Category,
  Channel,
  ChannelPanelView,
  LinkItem,
  MediaItem,
  Message,
  ServerInfo,
  ServerPage,
  User,
} from './types';
import { accessParentsFrom } from './lib/channelAccess';
import { canReadChannel, canWriteChannel, visibleChannels } from './lib/permissions';
import { isDeepLink, parsePath, routeTitle, type AppRoute } from './lib/routes';
import { useApi } from './hooks/useApi';
import { useAppRouter } from './hooks/useAppRouter';
import { useChannelUnread } from './hooks/useChannelUnread';
import { useWebSocket } from './hooks/useWebSocket';
import { getLastReadMessageId } from './lib/readPosition';
import { MESSAGE_JUMP_HIGHLIGHT_MS } from './lib/constants';
import { ensureMessageInList } from './lib/messages';
import { getToken, setToken } from './lib/session';
import { OnboardingScreen } from './components/OnboardingScreen';
import { LoginScreen } from './components/LoginScreen';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatArea } from './components/ChatArea';
import { ChannelPanel } from './components/ChannelPanel';
import { AdminPanel } from './components/AdminPanel';
import { ServerInfoPage } from './components/serverPages/ServerInfoPage';
import { ServerMembersPage } from './components/serverPages/ServerMembersPage';
import { ServerMediaPage } from './components/serverPages/ServerMediaPage';
import { ServerSearchPage } from './components/serverPages/ServerSearchPage';
import { ServerSettingsPage } from './components/serverPages/ServerSettingsPage';
import { DeleteMessageModal } from './components/DeleteMessageModal';

export default function App() {
  const api = useApi();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [server, setServer] = useState<ServerInfo>({
    name: 'Breeze',
    description: '',
    onboarded: false,
    loginDisabled: false,
    loginNotice: '',
    uncategorizedReadAccess: 'everyone',
    uncategorizedWriteAccess: 'everyone',
  });
  const [messageActivity, setMessageActivity] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState('');
  const [serverPage, setServerPage] = useState<ServerPage | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [serverMedia, setServerMedia] = useState<MediaItem[]>([]);
  const [serverLinks, setServerLinks] = useState<LinkItem[]>([]);
  const [channelPanel, setChannelPanel] = useState<ChannelPanelView | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [channelMessageCount, setChannelMessageCount] = useState<number | undefined>();
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [highlightTick, setHighlightTick] = useState(0);
  const jumpMessageRef = useRef<Message | null>(null);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(() =>
    isDeepLink(window.location.pathname) ? 'Please login first.' : null,
  );
  const initialRouteAppliedRef = useRef(false);
  const routerRef = useRef<ReturnType<typeof useAppRouter> | null>(null);
  const [activeChannelCaughtUp, setActiveChannelCaughtUp] = useState(true);
  const incomingMessageHandlerRef = useRef<(message: Message) => void>(() => {});

  const handleWsMessage = useCallback((data: { type: string; payload?: unknown }) => {
    switch (data.type) {
      case 'message': {
        const { message } = data.payload as { message: Message };
        incomingMessageHandlerRef.current(message);
        setMessageActivity((n) => n + 1);
        setMessages((prev) => {
          if (message.channelId !== activeChannelId) return prev;
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        break;
      }
      case 'message_updated': {
        const { message } = data.payload as { message: Message };
        setMessages((prev) => {
          if (message.channelId !== activeChannelId) return prev;
          if (!prev.some((m) => m.id === message.id)) return prev;
          return prev.map((m) => (m.id === message.id ? message : m));
        });
        break;
      }
      case 'message_deleted': {
        setMessageActivity((n) => n + 1);
        const payload = data.payload as { message?: Message; messageId?: string; channelId?: string };
        if (payload.message) {
          setMessages((prev) => {
            if (payload.message!.channelId !== activeChannelId) return prev;
            return prev.map((m) => (m.id === payload.message!.id ? payload.message! : m));
          });
        } else if (payload.messageId && payload.channelId === activeChannelId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === payload.messageId ? { ...m, deleted: true } : m)),
          );
        }
        break;
      }
      case 'presence': {
        const { users: updatedUsers } = data.payload as { users: User[] };
        setUsers(updatedUsers);
        break;
      }
      case 'user_moderated': {
        const { user: moderatedUser } = data.payload as { user: User };
        setUsers((prev) => prev.map((u) => (u.id === moderatedUser.id ? moderatedUser : u)));
        break;
      }
      case 'channels_updated':
      case 'channel_deleted': {
        const payload = data.payload as {
          channels: Channel[];
          categories?: Category[];
        };
        setChannels(payload.channels);
        if (payload.categories) setCategories(payload.categories);
        break;
      }
      case 'categories_updated': {
        const { categories: cats } = data.payload as { categories: Category[] };
        setCategories(cats);
        break;
      }
      case 'server_updated': {
        const { server: updated } = data.payload as { server: ServerInfo };
        setServer(updated);
        break;
      }
      case 'typing': {
        const { channelId, username } = data.payload as { channelId: string; username: string };
        if (channelId === activeChannelId && !serverPage) {
          setTypingUser(username);
          setTimeout(() => setTypingUser(null), 3000);
        }
        break;
      }
      case 'auth_ok': {
        const payload = data.payload as {
          server?: ServerInfo;
          channels?: Channel[];
          categories?: Category[];
          users?: User[];
        };
        if (payload.server) setServer(payload.server);
        if (payload.channels) setChannels(payload.channels);
        if (payload.categories) setCategories(payload.categories);
        if (payload.users) setUsers(payload.users);
        break;
      }
    }
  }, [activeChannelId, serverPage]);

  const {
    connected,
    user,
    authError,
    authenticate,
    authenticateWithToken,
    sendMessage,
    sendTyping,
    clearAuthError,
  } = useWebSocket(handleWsMessage);

  const isAdmin = user?.role === 'admin';
  const accessParents = useMemo(() => accessParentsFrom(server, categories), [server, categories]);
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const canWrite =
    activeChannel && user ? canWriteChannel(activeChannel, user.role, accessParents) : false;

  const { channelUnread, syncActiveChannel, handleIncomingMessage } = useChannelUnread({
    userId: user?.id ?? '',
    userRole: user?.role ?? 'member',
    channels,
    users,
    activeChannelId,
    activeChannelCaughtUp,
    viewingChannel: !serverPage && !!activeChannelId,
    getChannelUnread: api.getChannelUnread,
  });

  const totalPingCount = useMemo(
    () =>
      Object.values(channelUnread).reduce((sum, info) => sum + (info.mentionCount ?? 0), 0),
    [channelUnread],
  );

  useEffect(() => {
    incomingMessageHandlerRef.current = handleIncomingMessage;
  }, [handleIncomingMessage]);

  const handleActiveReadChange = useCallback(
    (lastReadId: string | null, caughtUp: boolean) => {
      setActiveChannelCaughtUp(caughtUp);
      if (!activeChannelId || !user) return;
      syncActiveChannel(messages, lastReadId);
    },
    [activeChannelId, messages, syncActiveChannel, user],
  );

  useEffect(() => {
    if (!user || !activeChannelId || serverPage) return;
    syncActiveChannel(messages, getLastReadMessageId(user.id, activeChannelId));
  }, [messages, activeChannelId, user, serverPage, syncActiveChannel]);

  useEffect(() => {
    api.getSetupStatus().then((s) => setNeedsOnboarding(s.needsOnboarding));
    api.getServer().then(setServer).catch(() => {});
  }, [api]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const handleChange = () => {
      if (mq.matches) setSidebarOpen(false);
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const refreshChannels = useCallback(async () => {
    const chs = await api.getChannels();
    setChannels(chs);
    setActiveChannelId((prev) => {
      if (prev && chs.some((c) => c.id === prev)) return prev;
      return chs[0]?.id || '';
    });
  }, [api]);

  useEffect(() => {
    if (!user) {
      setUsers([]);
      return;
    }
    api.getServer().then(setServer);
    api.getCategories().then(setCategories);
    refreshChannels();
    api.getUsers().then(setUsers);
  }, [api, user, refreshChannels]);

  useEffect(() => {
    if (!user || serverPage) return;
    if (!activeChannelId) return;
    if (channels.length === 0) return;

    const channel = channels.find((c) => c.id === activeChannelId);
    if (channel && canReadChannel(channel, user.role, accessParents)) return;

    const readable = visibleChannels(channels, user.role, accessParents);
    const nextId = readable[0]?.id ?? '';
    setChannelPanel(null);
    setMessages([]);
    setTypingUser(null);
    if (nextId) {
      setActiveChannelId(nextId);
      routerRef.current?.navigate({ view: 'channel', channelId: nextId }, { replace: true });
    } else {
      setActiveChannelId('');
      setServerPage('info');
      routerRef.current?.navigate({ view: 'server', page: 'info' }, { replace: true });
    }
  }, [user, channels, accessParents, activeChannelId, serverPage]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const pendingHighlightRef = useRef<string | null>(null);

  const applyHighlight = useCallback((messageId: string) => {
    setHighlightMessageId(messageId);
    setHighlightTick((tick) => tick + 1);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightMessageId(null), MESSAGE_JUMP_HIGHLIGHT_MS);
  }, []);

  const scheduleHighlight = useCallback((messageId: string) => {
    pendingHighlightRef.current = messageId;
    if (messagesRef.current.some((m) => m.id === messageId)) {
      pendingHighlightRef.current = null;
      applyHighlight(messageId);
    }
  }, [applyHighlight]);

  const applyRoute = useCallback(
    async (route: AppRoute) => {
      if (!user) return;

      const firstReadableChannelId = () =>
        channels.find((c) => canReadChannel(c, user.role, accessParents))?.id || channels[0]?.id;

      if (route.view === 'server') {
        if (route.page === 'settings' && user.role !== 'admin') {
          routerRef.current?.navigateToServerPage('info');
          return;
        }
        setServerPage(route.page);
        setChannelPanel(null);
        setAdminPanelOpen(false);
        setSidebarOpen(false);
        setMessages([]);
        setTypingUser(null);
        if (route.page === 'members') api.getUsers().then(setUsers);
        return;
      }

      if (route.view === 'home') {
        const id = firstReadableChannelId();
        setServerPage(null);
        setChannelPanel(null);
        setAdminPanelOpen(false);
        if (id) {
          jumpMessageRef.current = null;
          setActiveChannelId(id);
          routerRef.current?.syncUrl({ view: 'channel', channelId: id }, true);
        } else {
          setServerPage('info');
          routerRef.current?.syncUrl({ view: 'server', page: 'info' }, true);
        }
        return;
      }

      const channel = channels.find((c) => c.id === route.channelId);
      if (!channel || !canReadChannel(channel, user.role, accessParents)) {
        const id = firstReadableChannelId();
        if (id) {
          routerRef.current?.navigate({ view: 'channel', channelId: id }, { replace: true });
        } else {
          routerRef.current?.navigate({ view: 'server', page: 'info' }, { replace: true });
        }
        return;
      }

      setServerPage(null);
      setChannelPanel(null);
      setAdminPanelOpen(false);
      setSidebarOpen(false);

      if (route.messageId) {
        try {
          const msg = await api.getMessage(route.messageId);
          if (msg.channelId !== route.channelId) {
            routerRef.current?.syncUrl({ view: 'channel', channelId: route.channelId }, true);
            if (route.channelId !== activeChannelId) {
              jumpMessageRef.current = null;
              setActiveChannelId(route.channelId);
              setMessages([]);
              setTypingUser(null);
            }
            return;
          }
          if (route.channelId === activeChannelId) {
            setMessages((prev) => ensureMessageInList(prev, msg));
            scheduleHighlight(msg.id);
          } else {
            jumpMessageRef.current = msg;
            setActiveChannelId(route.channelId);
            setTypingUser(null);
          }
        } catch {
          jumpMessageRef.current = null;
          routerRef.current?.syncUrl({ view: 'channel', channelId: route.channelId }, true);
          if (route.channelId !== activeChannelId) {
            setActiveChannelId(route.channelId);
            setMessages([]);
            setTypingUser(null);
          }
        }
        return;
      }

      if (route.channelId !== activeChannelId) {
        jumpMessageRef.current = null;
        setActiveChannelId(route.channelId);
        setMessages([]);
        setTypingUser(null);
      }
    },
    [user, channels, accessParents, api, activeChannelId, scheduleHighlight],
  );

  const router = useAppRouter({
    enabled: !!user,
    serverName: server.name,
    channelName: activeChannel?.name,
    onRoute: (route) => {
      void applyRoute(route);
    },
  });
  routerRef.current = router;

  useEffect(() => {
    if (!user) {
      initialRouteAppliedRef.current = false;
      document.title = routeTitle(parsePath(window.location.pathname), server.name);
      return;
    }
    setLoginNotice(null);
  }, [user, server.name]);

  useEffect(() => {
    if (!user || channels.length === 0 || initialRouteAppliedRef.current) return;
    initialRouteAppliedRef.current = true;
    void applyRoute(parsePath(window.location.pathname));
  }, [user, channels, applyRoute]);

  useEffect(() => {
    const pending = pendingHighlightRef.current;
    if (!pending || !messages.some((m) => m.id === pending)) return;
    pendingHighlightRef.current = null;
    applyHighlight(pending);
  }, [messages, applyHighlight]);

  useEffect(() => {
    setActiveChannelCaughtUp(true);
  }, [activeChannelId]);

  useEffect(() => {
    if (!activeChannelId || !user || serverPage) return;
    const jump = jumpMessageRef.current;
    api.getMessages(activeChannelId)
      .then((msgs) => {
        if (jump?.channelId === activeChannelId) {
          setMessages(ensureMessageInList(msgs, jump));
          scheduleHighlight(jump.id);
          jumpMessageRef.current = null;
        } else {
          setMessages(msgs);
        }
      })
      .catch(() => setMessages([]));
    api.getMedia(activeChannelId).then((data) => {
      setMedia(data.media);
      setLinks(data.links);
    });
  }, [activeChannelId, api, user, serverPage, scheduleHighlight]);

  const handleJumpToMessage = useCallback(
    (message: Message) => {
      if (window.matchMedia('(max-width: 768px)').matches) {
        setChannelPanel(null);
        setSidebarOpen(false);
      }
      router.navigateToChannel(message.channelId, message.id);
    },
    [router],
  );

  const handleMessageLink = useCallback(
    (channelId: string, messageId: string) => {
      if (window.matchMedia('(max-width: 768px)').matches) {
        setChannelPanel(null);
        setSidebarOpen(false);
      }
      router.navigateToChannel(channelId, messageId);
    },
    [router],
  );

  useEffect(() => {
    if (!serverPage || !user) return;
    if (serverPage === 'media') {
      api.getMedia().then((data) => {
        setServerMedia(data.media);
        setServerLinks(data.links);
      });
    }
  }, [serverPage, api, user]);

  useEffect(() => {
    if (channelPanel === 'info' && activeChannelId) {
      api.getChannelStats(activeChannelId).then((s) => setChannelMessageCount(s.messageCount));
    }
  }, [channelPanel, activeChannelId, api]);

  function handleToggleChannelPanel(view: ChannelPanelView) {
    setChannelPanel((prev) => (prev === view ? null : view));
    if (view === 'media' && activeChannelId) {
      api.getMedia(activeChannelId).then((data) => {
        setMedia(data.media);
        setLinks(data.links);
      });
    }
  }

  function handleOpenServerPage(page: ServerPage) {
    router.navigateToServerPage(page);
  }

  function handleSelectChannel(id: string) {
    router.navigateToChannel(id);
  }

  function handleOpenAdmin() {
    setAdminPanelOpen((open) => !open);
    setServerPage(null);
    setChannelPanel(null);
    if (activeChannelId) {
      router.syncUrl({ view: 'channel', channelId: activeChannelId }, true);
    }
  }

  async function handleOnboard(username: string, password: string, serverName: string) {
    const result = await api.onboard(username, password, serverName);
    setToken(result.token);
    setNeedsOnboarding(false);
    return result;
  }

  function handleOnboardComplete(token: string) {
    authenticateWithToken(token);
  }

  function handleLogin(username: string, password?: string) {
    clearAuthError();
    authenticate(username, password);
  }

  function handleRequestDeleteMessage(messageId: string) {
    const message = messages.find((m) => m.id === messageId);
    if (message && !message.deleted) setDeleteTarget(message);
  }

  async function handleConfirmDeleteMessage() {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const { message } = await api.deleteMessage(deleteTarget.id);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  const moderationHandlers = {
    onEndSession: async (id: string) => { await api.endSession(id); },
    onBanUser: async (id: string) => {
      const u = await api.banUser(id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    },
    onTimeoutUser: async (id: string, minutes: number) => {
      const u = await api.timeoutUser(id, minutes);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    },
    onUnbanUser: async (id: string) => {
      const u = await api.unbanUser(id);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
    },
  };

  if (needsOnboarding === null) {
    return <div className="login-screen"><div className="login-card"><p>Loading…</p></div></div>;
  }

  if (needsOnboarding) {
    return <OnboardingScreen onSubmit={handleOnboard} onComplete={handleOnboardComplete} />;
  }

  if (!user && getToken()) {
    return <div className="login-screen"><div className="login-card"><p>Connecting…</p></div></div>;
  }

  if (!user) {
    return (
      <LoginScreen
        serverName={server.name}
        serverDescription={server.description}
        loginDisabled={!!server.loginDisabled}
        loginNotice={server.loginNotice}
        onLogin={handleLogin}
        onCheckUsername={async (u) => (await api.checkUsername(u)).requiresPassword}
        connected={connected}
        error={authError || loginNotice}
      />
    );
  }

  return (
    <div className="app">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
      <Sidebar
        serverName={server.name}
        accessParents={accessParents}
        channels={channels}
        activeChannelId={activeChannelId}
        activeServerPage={serverPage}
        userRole={user.role}
        isAdmin={isAdmin}
        adminPanelOpen={adminPanelOpen}
        flyoutOpen={sidebarOpen}
        onSelectChannel={handleSelectChannel}
        onOpenServerPage={handleOpenServerPage}
        onOpenAdmin={() => {
          handleOpenAdmin();
          setSidebarOpen(false);
        }}
        onCloseFlyout={() => setSidebarOpen(false)}
        channelUnread={channelUnread}
      />
      <div className="app-main">
        {!serverPage && (
          <TopBar
            channel={activeChannel}
            activePanel={channelPanel}
            totalPingCount={totalPingCount}
            onTogglePanel={handleToggleChannelPanel}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
          />
        )}
        <div className="app-content">
          {serverPage === 'info' && (
            <ServerInfoPage users={users} messageActivity={messageActivity} />
          )}
          {serverPage === 'members' && (
            <ServerMembersPage
              users={users}
              isAdmin={isAdmin}
              currentUserId={user.id}
              {...(isAdmin ? moderationHandlers : {})}
            />
          )}
          {serverPage === 'media' && (
            <ServerMediaPage
              media={serverMedia}
              links={serverLinks}
              channels={channels}
              onMessageLink={handleMessageLink}
            />
          )}
          {serverPage === 'search' && (
            <ServerSearchPage
              channels={channels}
              users={users}
              onSearch={api.searchMessages}
              onJumpToMessage={handleJumpToMessage}
            />
          )}
          {serverPage === 'settings' && isAdmin && (
            <ServerSettingsPage
              server={server}
              categories={categories}
              channels={channels}
              onSaveIdentity={async (name, description) => {
                const updated = await api.updateServer({ name, description });
                setServer(updated);
              }}
              onSaveAccess={async (loginDisabled, loginNotice) => {
                const updated = await api.updateServer({ loginDisabled, loginNotice });
                setServer(updated);
              }}
              onEndSessionsByRole={async (role) => {
                const result = await api.endSessionsByRole(role);
                return result.endedCount;
              }}
              onUpdateChannelLayout={async (items) => {
                await api.updateChannelLayout(items);
                await refreshChannels();
              }}
              onReorderCategories={async (orderedIds) => {
                const updated = await api.reorderCategories(orderedIds);
                setCategories(updated);
              }}
              onUpdateCategory={async (id, data) => {
                const updated = await api.updateCategory(id, data);
                setCategories((prev) => prev.map((category) => (category.id === id ? updated : category)));
              }}
              onUpdateUncategorizedAccess={async (readAccess, writeAccess) => {
                const updated = await api.updateServer({ uncategorizedReadAccess: readAccess, uncategorizedWriteAccess: writeAccess });
                setServer(updated);
              }}
              onUpdateChannel={async (id, data) => {
                await api.updateChannel(id, data);
                await refreshChannels();
              }}
              onCreateCategory={async (name) => {
                const category = await api.createCategory(name);
                setCategories((prev) => [...prev, category].sort((a, b) => a.position - b.position));
              }}
              onCreateChannel={async (data) => {
                await api.createChannel(data);
                await refreshChannels();
              }}
            />
          )}
          {!serverPage && activeChannel && (
            <ChatArea
              channelId={activeChannelId}
              channelName={activeChannel.name}
              messages={messages}
              users={users}
              channels={channels}
              accessParents={accessParents}
              userRole={user.role}
              typingUser={typingUser}
              highlightMessageId={highlightMessageId}
              highlightTick={highlightTick}
              canWrite={canWrite}
              isAdmin={isAdmin}
              onRequestDeleteMessage={handleRequestDeleteMessage}
              onSelectChannel={handleSelectChannel}
              onMessageLink={handleMessageLink}
              currentUserId={user.id}
              onSend={(content) => sendMessage(activeChannelId, content)}
              onTyping={() => sendTyping(activeChannelId)}
              onReadChange={handleActiveReadChange}
            />
          )}
          {!serverPage && channelPanel && activeChannel && (
            <ChannelPanel
              view={channelPanel}
              channel={activeChannel}
              accessParents={accessParents}
              users={users}
              isAdmin={isAdmin}
              currentUserId={user.id}
              media={media}
              links={links}
              messages={messages}
              messageCount={channelMessageCount}
              onClose={() => setChannelPanel(null)}
              onJumpToMessage={handleJumpToMessage}
              onMessageLink={handleMessageLink}
              {...(isAdmin ? moderationHandlers : {})}
            />
          )}
          {adminPanelOpen && isAdmin && (
            <AdminPanel
              server={server}
              categories={categories}
              channels={channels}
              users={users}
              currentUserId={user.id}
              onClose={() => setAdminPanelOpen(false)}
              onUpdateServer={async (name, description) => {
                const updated = await api.updateServer({ name, description });
                setServer(updated);
              }}
              onCreateCategory={async (name) => {
                await api.createCategory(name);
                setCategories(await api.getCategories());
              }}
              onDeleteCategory={async (id) => {
                await api.deleteCategory(id);
                setCategories(await api.getCategories());
                await refreshChannels();
              }}
              onCreateChannel={async (data) => {
                await api.createChannel(data);
                await refreshChannels();
              }}
              onUpdateChannel={async (id, data) => {
                await api.updateChannel(id, data);
                await refreshChannels();
              }}
              onDeleteChannel={async (id) => {
                await api.deleteChannel(id);
                await refreshChannels();
              }}
              {...moderationHandlers}
            />
          )}
        </div>
      </div>
      {deleteTarget && (
        <DeleteMessageModal
          message={deleteTarget}
          authorName={users.find((u) => u.id === deleteTarget.userId)?.username || 'Unknown'}
          users={users}
          channels={channels}
          onConfirm={handleConfirmDeleteMessage}
          onCancel={() => !deleteBusy && setDeleteTarget(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}