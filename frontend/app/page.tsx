"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createSession,
  deleteSession,
  getSession,
  listImages,
  listSessions,
  postMessage,
  SessionCapError,
  type ImageRecord,
  type MessageRecord,
  type SessionRecord,
} from "../lib/api";
import { SessionList } from "../components/SessionList";
import { NewSessionModal } from "../components/NewSessionModal";
import { LibraryDrawer } from "../components/LibraryDrawer";
import { ChatView } from "../components/ChatView";
import { ChatComposer, type ModifyBase } from "../components/ChatComposer";

function DiamondMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="26"
      height="26"
      aria-hidden
      className="drop-shadow-[0_1px_2px_rgba(184,144,40,0.25)]"
    >
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6cc7a" />
          <stop offset="50%" stopColor="#d4b352" />
          <stop offset="100%" stopColor="#9a7619" />
        </linearGradient>
      </defs>
      <path
        d="M6 12 L16 4 L26 12 L16 28 Z"
        fill="url(#dg)"
        stroke="rgba(26,22,17,0.18)"
        strokeWidth="0.5"
      />
      <path d="M6 12 L26 12" stroke="rgba(26,22,17,0.18)" strokeWidth="0.5" fill="none" />
      <path d="M16 4 L11 12 L16 28" stroke="rgba(26,22,17,0.12)" strokeWidth="0.5" fill="none" />
      <path d="M16 4 L21 12 L16 28" stroke="rgba(26,22,17,0.12)" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

export default function Page() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCapModal, setShowCapModal] = useState(false);

  const [images, setImages] = useState<ImageRecord[]>([]);
  const [modifyBase, setModifyBase] = useState<ModifyBase>(null);

  const refreshImages = useCallback(async () => {
    try {
      setImages(await listImages());
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const list = await listSessions();
    setSessions(list);
    return list;
  }, []);

  // Forward-declared so openSession can use it for 404 recovery.
  const recoverFromMissingSession = useCallback(
    async (missingId: string): Promise<string | null> => {
      console.warn(`[session] ${missingId} not found — recovering`);
      const list = await listSessions();
      setSessions(list);
      const fallback = list.find((s) => s.id !== missingId);
      if (fallback) return fallback.id;
      try {
        const created = await createSession();
        const refreshed = await listSessions();
        setSessions(refreshed);
        return created.id;
      } catch {
        return null;
      }
    },
    [],
  );

  const openSession = useCallback(
    async (id: string) => {
      setActiveId(id);
      setMessages([]);
      setModifyBase(null);
      setError(null);
      try {
        const { messages: msgs } = await getSession(id);
        setMessages(msgs);
      } catch (e) {
        const msg = (e as Error).message;
        // 404 on a session almost always means the local list is stale
        // (someone deleted it, or the page held a phantom id). Recover
        // silently rather than leaving the user staring at an error.
        if (/404/.test(msg) || /not found/i.test(msg)) {
          const next = await recoverFromMissingSession(id);
          if (next && next !== id) {
            setActiveId(next);
            try {
              const { messages: msgs } = await getSession(next);
              setMessages(msgs);
            } catch (inner) {
              setError((inner as Error).message);
            }
            return;
          }
          setActiveId(null);
          setMessages([]);
          return;
        }
        setError(msg);
      }
    },
    [recoverFromMissingSession],
  );

  // First load: pull sessions + library, then open (or create) the active session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshImages();
        const list = await refreshSessions();
        if (cancelled) return;
        if (list.length === 0) {
          const created = await createSession();
          if (cancelled) return;
          await refreshSessions();
          await openSession(created.id);
        } else {
          await openSession(list[0]!.id);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openSession, refreshImages, refreshSessions]);

  async function handleNew() {
    setError(null);
    try {
      const created = await createSession();
      await refreshSessions();
      await openSession(created.id);
    } catch (e) {
      if (e instanceof SessionCapError) {
        setShowCapModal(true);
      } else {
        setError((e as Error).message);
      }
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSession(id);
      const list = await refreshSessions();
      if (id === activeId) {
        if (list.length > 0) {
          await openSession(list[0]!.id);
        } else {
          setActiveId(null);
          setMessages([]);
        }
      }
      // If we deleted from inside the cap modal, dismiss it and immediately
      // open a fresh session for the user.
      if (showCapModal) {
        setShowCapModal(false);
        try {
          const created = await createSession();
          await refreshSessions();
          await openSession(created.id);
        } catch (e) {
          setError((e as Error).message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSend(rawText: string) {
    if (!activeId) return;
    const composed = rawText.trim();
    const opts = modifyBase
      ? { modifyBaseId: modifyBase.generationId }
      : undefined;

    // Optimistic user bubble so the UI feels responsive while the agent thinks.
    const optimistic: MessageRecord = {
      id: `local-${Date.now()}`,
      sessionId: activeId,
      role: "user",
      content: composed,
      meta: null,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setBusy(true);
    setError(null);

    try {
      const { userMessage, assistantMessage } = await postMessage(
        activeId,
        composed,
        opts ?? {},
      );
      setMessages((prev) => {
        // Swap the optimistic message for the real one and append the assistant reply.
        const without = prev.filter((m) => m.id !== optimistic.id);
        return [
          ...without,
          userMessage,
          ...(assistantMessage ? [assistantMessage] : []),
        ];
      });
      setModifyBase(null);
      // Updated_at changed — refresh sessions so the active one floats up.
      await refreshSessions();
    } catch (e) {
      const msg = (e as Error).message;
      // Drop the optimistic bubble first so the dropped send is reflected.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));

      // Stale activeId: silently switch to a real session and tell the user
      // why their message didn't land. Better than the dead-end "404" toast.
      if (/404/.test(msg) || /not found/i.test(msg)) {
        const next = await recoverFromMissingSession(activeId);
        if (next) {
          await openSession(next);
          setError(
            "That session was no longer available — switched you to a fresh one. Try sending again.",
          );
        } else {
          setActiveId(null);
          setMessages([]);
          setError("That session was no longer available.");
        }
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="h-screen flex bg-ivory-100 text-ink-800">
      {/* ─── LEFT RAIL ─── */}
      <aside className="w-80 shrink-0 border-r border-bone-200 bg-ivory-50 flex flex-col">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-bone-200 shrink-0">
          <DiamondMark />
          <div className="leading-tight group cursor-default">
            <p className="font-display text-xl text-ink-900 tracking-wide group-hover:text-gold-animated transition-colors duration-500">
              Diamond
            </p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-ink-500 mt-0.5">
              Studio
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          <SessionList
            sessions={sessions}
            activeId={activeId}
            onSelect={openSession}
            onNew={handleNew}
            onDelete={handleDelete}
          />
        </div>

        <div className="border-t border-bone-200 px-5 py-4 shrink-0">
          <LibraryDrawer images={images} onUploaded={refreshImages} />
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <section className="flex-1 flex flex-col min-w-0">
        <header className="px-10 pt-7 pb-5 border-b border-bone-300 shrink-0">
          <h1 className="font-display text-4xl tracking-wide text-ink-900 leading-none">
            Diamond
            <span className="text-ink-500 font-light ml-3 text-2xl tracking-wider">
              Agent
            </span>
          </h1>
          <p className="text-xs text-ink-500 mt-2.5 tracking-wide max-w-2xl">
            One studio for finding pieces, designing new ones, and turning them
            into 3D drafts — all in one conversation.
          </p>
        </header>

        {error && (
          <p className="mx-10 mt-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-1.5">
            {error}
          </p>
        )}

        <div className="flex-1 min-h-0 flex flex-col">
          <ChatView
            messages={messages}
            busy={busy}
            libraryImages={images}
            onSelectModifyBase={(args) => setModifyBase(args)}
            onDraftGenerated={(msg) => {
              setMessages((prev) => [...prev, msg]);
              void refreshSessions();
            }}
          />
          <ChatComposer
            busy={busy || !activeId}
            modifyBase={modifyBase}
            onClearModify={() => setModifyBase(null)}
            onSend={handleSend}
          />
        </div>
      </section>

      {showCapModal && (
        <NewSessionModal
          sessions={sessions}
          onDelete={handleDelete}
          onClose={() => setShowCapModal(false)}
        />
      )}
    </main>
  );
}
