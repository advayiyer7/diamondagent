"use client";

import { useEffect, useRef } from "react";
import type { ImageRecord, MessageRecord } from "../lib/api";
import { ChatMessage } from "./ChatMessage";

type Props = {
  messages: MessageRecord[];
  busy: boolean;
  libraryImages: ImageRecord[];
  onSelectModifyBase: (args: { generationId: string; url: string; prompt: string }) => void;
  onDraftGenerated: (message: MessageRecord) => void;
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot" />
      <span
        className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

export function ChatView({
  messages,
  busy,
  libraryImages,
  onSelectModifyBase,
  onDraftGenerated,
}: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  if (messages.length === 0 && !busy) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        <div className="w-14 h-14 rounded-full bg-gold-300/15 border border-gold-400/40 flex items-center justify-center mb-5">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-gold-600">
            <path d="M12 3 L20 9 L17 19 L7 19 L4 9 Z" />
          </svg>
        </div>
        <p className="font-display text-2xl text-ink-900 tracking-wide">
          What shall we make?
        </p>
        <p className="text-xs text-ink-500 mt-3 max-w-md leading-relaxed">
          Ask about pieces in your library, or describe something new and
          we&rsquo;ll work the design together — references, refinements,
          and a 3D draft when you&rsquo;re ready.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
      {messages.map((m) => (
        <ChatMessage
          key={m.id}
          message={m}
          onSelectModifyBase={onSelectModifyBase}
          libraryImages={libraryImages}
          onDraftGenerated={onDraftGenerated}
        />
      ))}
      {busy && (
        <div className="flex justify-start animate-fade-up">
          <div className="bg-ivory-50 border border-bone-300 rounded-sm">
            <TypingDots />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
