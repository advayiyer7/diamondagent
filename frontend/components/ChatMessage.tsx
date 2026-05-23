"use client";

import { useEffect, useRef, useState } from "react";
import {
  getModel,
  imageUrl,
  modelFileUrl,
  type ImageRecord,
  type MessageRecord,
  type ModelRecord,
} from "../lib/api";
import { ModelViewer } from "./ModelViewer";
import { DraftPanel } from "./DraftPanel";
import { Generate3DButton } from "./Generate3DButton";

const POLL_INTERVAL_MS = 3_000;

type Props = {
  message: MessageRecord;
  /** Click an inline 2D image → set as modify base for the next composer turn. */
  onSelectModifyBase: (args: { generationId: string; url: string; prompt: string }) => void;
  /** Library — passed to draft panels for the "Show full library" reveal. */
  libraryImages: ImageRecord[];
  /** Called when a draft Generate succeeds — parent appends the new message. */
  onDraftGenerated: (message: MessageRecord) => void;
};

function MatchedImages({
  images,
}: {
  images: NonNullable<MessageRecord["meta"]>["matchedImages"];
}) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2.5">
      {images.map((img) => (
        <figure
          key={img.id}
          className="group relative rounded-sm overflow-hidden border border-bone-300 bg-ivory-50 transition-all duration-300 hover:border-gold-500 hover:shadow-[0_0_18px_rgba(199,199,203,0.4)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(img.url)}
            alt={img.filename}
            className="w-36 h-36 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <figcaption
            className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-ivory-50 bg-ink-900/80 truncate"
            title={img.filename}
          >
            {img.filename}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function GeneratedImage({
  gen,
  onSelectModifyBase,
}: {
  gen: NonNullable<MessageRecord["meta"]>["generatedImage"];
  onSelectModifyBase: Props["onSelectModifyBase"];
}) {
  if (!gen) return null;
  return (
    <div className="mt-3 max-w-md">
      <button
        type="button"
        onClick={() =>
          onSelectModifyBase({
            generationId: gen.id,
            url: gen.url,
            prompt: gen.prompt,
          })
        }
        className="block w-full rounded-sm overflow-hidden border-[1.5px] border-gold-500 hover:shadow-[0_0_24px_rgba(184,144,40,0.25)] transition-shadow duration-300 focus-gold group"
        title="Click to modify this design"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl(gen.url)}
          alt={gen.prompt}
          className="w-full h-auto"
        />
      </button>
      <p className="caption-italic text-[11px] text-ink-500 mt-2 leading-relaxed">
        Click the image to modify it. &ldquo;{gen.prompt}&rdquo;
      </p>
      <Generate3DButton generationId={gen.id} />
    </div>
  );
}

function ModelDraft({ modelId }: { modelId: string }) {
  const [model, setModel] = useState<ModelRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loop() {
      try {
        const next = await getModel(modelId);
        if (cancelled) return;
        setModel(next);
        if (next.status === "completed" || next.status === "failed") return;
        timer.current = setTimeout(loop, POLL_INTERVAL_MS);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        timer.current = setTimeout(loop, POLL_INTERVAL_MS);
      }
    }

    void loop();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [modelId]);

  if (!model) {
    return (
      <div className="mt-3 max-w-md">
        <div className="h-2 w-full rounded-full bg-bone-200 overflow-hidden border border-bone-300">
          <div className="h-full w-[6%] bg-gold-gradient shadow-glow" />
        </div>
        <p className="caption-italic text-[11px] text-ink-500 mt-2">Submitting the draft…</p>
        {error && (
          <p className="text-[11px] text-red-700 mt-1 caption-italic">{error}</p>
        )}
      </div>
    );
  }

  if (model.status === "failed") {
    return (
      <div className="mt-3 max-w-md">
        <p className="caption-italic text-[12px] text-ink-500">
          The 3D draft failed: {model.errorMessage ?? "unknown error"}.
        </p>
      </div>
    );
  }

  if (model.status === "completed" && model.fileUrl) {
    const absUrl = modelFileUrl(model.fileUrl);
    return (
      <div className="mt-3 max-w-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-gold-700 font-medium">
            3D Draft
          </span>
          <a
            href={absUrl}
            download={`diamond-model-${model.id}.glb`}
            className="text-[10px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 relative group"
          >
            Download .glb ↓
            <span className="absolute left-0 right-0 bottom-[-2px] h-px bg-gold-600 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
          </a>
        </div>
        <ModelViewer src={absUrl} />
        <p className="caption-italic text-[11px] text-ink-500 mt-2 leading-relaxed">
          A reference draft for your CAD designer. Fine details may require manual refinement.
        </p>
      </div>
    );
  }

  const pct = Math.max(6, Math.min(100, model.progress ?? 0));
  return (
    <div className="mt-3 max-w-md">
      <div className="h-2 w-full rounded-full bg-bone-200 overflow-hidden border border-bone-300">
        <div
          className="h-full bg-gold-gradient shadow-glow transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="caption-italic text-[11px] text-ink-500 mt-2">
        Crafting the 3D draft — {model.progress ?? 0}%. Typical runs take 60–180 seconds.
      </p>
    </div>
  );
}

export function ChatMessage({
  message,
  onSelectModifyBase,
  libraryImages,
  onDraftGenerated,
}: Props) {
  const isUser = message.role === "user";
  const meta = message.meta ?? null;

  return (
    <div
      className={
        "flex animate-fade-up " + (isUser ? "justify-end" : "justify-start")
      }
    >
      <div className={"max-w-[78%] " + (isUser ? "items-end" : "items-start")}>
        <div
          className={
            "px-5 py-3 text-sm whitespace-pre-wrap leading-relaxed rounded-sm " +
            (isUser
              ? "bg-gold-gradient text-ink-900 shadow-glow font-medium"
              : "bg-ivory-50 text-ink-800 border border-bone-300")
          }
        >
          {message.content}
        </div>

        {!isUser && meta?.intent === "search" && (
          <MatchedImages images={meta.matchedImages} />
        )}
        {!isUser && meta?.intent === "design" && meta.generatedImage && (
          <GeneratedImage
            gen={meta.generatedImage}
            onSelectModifyBase={onSelectModifyBase}
          />
        )}
        {!isUser && meta?.intent === "design-draft" && meta.designDraft && (
          <DraftPanel
            sessionId={message.sessionId}
            draft={meta.designDraft}
            libraryImages={libraryImages}
            onGenerated={onDraftGenerated}
          />
        )}
        {!isUser && meta?.intent === "model3d" && meta.modelDraft && (
          <ModelDraft modelId={meta.modelDraft.modelId} />
        )}
      </div>
    </div>
  );
}
