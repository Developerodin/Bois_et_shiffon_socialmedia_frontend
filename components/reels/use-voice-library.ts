"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryVoice } from "@/shared";
import { errorMessage } from "@/components/settings/api";
import { voicesApi } from "./api";
import { defaultLibraryLanguage, isAbort, libraryNarrowed, mergeLibraryPage } from "./voices";

type Result = { voices: LibraryVoice[]; more: boolean; usable: boolean; page: number };

/**
 * The ElevenLabs library for the Voices sheet. Held by the sheet, so results survive tab switches. The first read starts
 * when `active` first turns true. A select change waits 300 ms; each read starts at page 0 and aborts the one in flight;
 * "More voices" adds the next page. Only the newest request may land (`ctl`): an answer for older filters is dropped.
 */
export function useVoiceLibrary(w: string, b: string, active: boolean, planLanguage: string | undefined) {
  const start = defaultLibraryLanguage(planLanguage);
  const [fields, setFields] = useState({ language: start, gender: "", age: "", useCase: "", search: "" });
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [nonce, setNonce] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const skipWait = useRef(true);
  if (active && !started) setStarted(true);

  const { language, gender, age, useCase, search } = fields;
  useEffect(() => {
    if (!started) return;
    ctl.current?.abort();
    ctl.current = null;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    const wait = skipWait.current ? 0 : 300;
    skipWait.current = false;
    const timer = setTimeout(() => {
      const c = new AbortController();
      ctl.current = c;
      voicesApi.library(w, b, { language, gender, age, useCase, search, page: 0 }, c.signal).then(
        (r) => {
          if (ctl.current !== c) return;
          setResult({ ...r, page: 0 });
          setLoading(false);
        },
        (e: unknown) => {
          if (ctl.current !== c || isAbort(e)) return;
          setError(errorMessage(e));
          setLoading(false);
        },
      );
    }, wait);
    return () => clearTimeout(timer);
  }, [started, w, b, language, gender, age, useCase, search, nonce]);
  useEffect(() => () => ctl.current?.abort(), []);

  const set = useCallback((key: "language" | "gender" | "age" | "useCase", value: string) => setFields((f) => ({ ...f, [key]: value })), []);
  /** Search and Clear act at once; a select waits for the next one. */
  const submit = () => {
    if (draft.trim() === search) return;
    skipWait.current = true;
    setFields((f) => ({ ...f, search: draft.trim() }));
  };
  const clear = () => {
    setDraft("");
    if (!libraryNarrowed(fields, start)) return;
    skipWait.current = true;
    setFields({ language: start, gender: "", age: "", useCase: "", search: "" });
  };

  function more() {
    if (!result?.more || loading || loadingMore) return;
    const c = new AbortController();
    ctl.current = c;
    const page = result.page + 1;
    setLoadingMore(true);
    setError(null);
    voicesApi.library(w, b, { language, gender, age, useCase, search, page }, c.signal).then(
      (r) => {
        if (ctl.current !== c) return;
        setResult((prev) => (prev ? { ...r, voices: mergeLibraryPage(prev.voices, r.voices), page } : prev));
        setLoadingMore(false);
      },
      (e: unknown) => {
        if (ctl.current !== c || isAbort(e)) return;
        setError(errorMessage(e));
        setLoadingMore(false);
      },
    );
  }

  return {
    fields, set, draft, setDraft, submit, clear, more,
    retry: () => { skipWait.current = true; setNonce((n) => n + 1); },
    narrowed: libraryNarrowed(fields, start),
    result, loading, loadingMore, error,
  };
}
