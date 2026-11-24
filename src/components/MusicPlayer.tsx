import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

type Track = {
  id: string;
  title: string;
  source_type: "upload" | "youtube";
  storage_path: string | null;
  youtube_video_id: string | null;
  duration_seconds: number | null;
};
type MusicState = {
  room_id: string;
  current_track_id: string | null;
  status: "playing" | "paused" | "stopped";
  position_seconds: number;
  playback_started_at: string | null;
};
type Props = { roomId: string; userId: string; role: "gm" | "player" };

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  destroy(): void;
  getCurrentTime(): number;
};
type YTApi = {
  Player: new (element: HTMLElement, options: {
    videoId: string;
    playerVars?: Record<string, number>;
    events?: { onReady?: (event: { target: YTPlayer }) => void; onError?: () => void };
  }) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;
function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Não foi possível carregar a API do YouTube."));
      document.head.appendChild(script);
    });
  }
  return youtubeApiPromise;
}

function extractYoutubeId(input: string) {
  try {
    const url = new URL(input);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).match(/^[A-Za-z0-9_-]{11}$/)?.[0] ?? null;
    if (url.hostname.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).at(-1);
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch { return null; }
  return null;
}

export default function MusicPlayer({ roomId, userId, role }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeHost = useRef<HTMLDivElement>(null);
  const youtubePlayer = useRef<YTPlayer | null>(null);
  const youtubeTrackId = useRef<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [volume, setVolume] = useState(0.65);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");

  const currentTrack = tracks.find((track) => track.id === musicState?.current_track_id) ?? null;

  const refresh = useCallback(async () => {
    const [trackResult, stateResult] = await Promise.all([
      supabase.from("music_tracks").select("id, title, source_type, storage_path, youtube_video_id, duration_seconds").order("created_at", { ascending: false }),
      supabase.from("room_music_state").select("room_id, current_track_id, status, position_seconds, playback_started_at").eq("room_id", roomId).maybeSingle(),
    ]);
    if (trackResult.error || stateResult.error) {
      setError("Não foi possível carregar a biblioteca musical.");
      setLoading(false);
      return;
    }
    setTracks((trackResult.data ?? []) as Track[]);
    setMusicState((stateResult.data ?? null) as MusicState | null);
    setLoading(false);
    setError("");
  }, [roomId, supabase]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel("room-music-" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_music_state", filter: "room_id=eq." + roomId }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "music_tracks" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, roomId, supabase]);

  useEffect(() => {
    if (!currentTrack || currentTrack.source_type !== "upload" || !currentTrack.storage_path) {
      setAudioUrl("");
      return;
    }
    let cancelled = false;
    void supabase.storage.from("music").createSignedUrl(currentTrack.storage_path, 3600).then(({ data, error: signedError }) => {
      if (cancelled) return;
      if (signedError || !data?.signedUrl) setError("Não foi possível acessar este arquivo de áudio.");
      else setAudioUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [currentTrack?.id, currentTrack?.storage_path, currentTrack?.source_type, supabase]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || !musicState || currentTrack?.source_type !== "upload") return;
    const elapsed = musicState.status === "playing" && musicState.playback_started_at
      ? Math.max(0, (Date.now() - Date.parse(musicState.playback_started_at)) / 1000)
      : 0;
    const target = Math.max(0, Number(musicState.position_seconds) + elapsed);
    audio.currentTime = target;
    if (musicState.status === "playing" && unlocked) {
      void audio.play().catch(() => setUnlocked(false));
    } else {
      audio.pause();
    }
  }, [audioUrl, currentTrack?.id, currentTrack?.source_type, musicState?.current_track_id, musicState?.playback_started_at, musicState?.position_seconds, musicState?.status, unlocked]);

  useEffect(() => {
    if (!currentTrack || currentTrack.source_type !== "youtube" || !currentTrack.youtube_video_id || !youtubeHost.current) {
      youtubePlayer.current?.destroy();
      youtubePlayer.current = null;
      youtubeTrackId.current = null;
      return;
    }
    let cancelled = false;
    void loadYoutubeApi().then(() => {
      if (cancelled || !youtubeHost.current || !window.YT) return;
      youtubePlayer.current?.destroy();
      youtubeTrackId.current = currentTrack.id;
      youtubePlayer.current = new window.YT.Player(youtubeHost.current, {
        videoId: currentTrack.youtube_video_id ?? "",
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, enablejsapi: 1 },
        events: {
          onReady: ({ target }) => {
            target.setVolume(Math.round(volume * 100));
            const elapsed = musicState?.status === "playing" && musicState.playback_started_at
              ? Math.max(0, (Date.now() - Date.parse(musicState.playback_started_at)) / 1000) : 0;
            target.seekTo(Math.max(0, Number(musicState?.position_seconds ?? 0) + elapsed), true);
            if (musicState?.status === "playing" && unlocked) target.playVideo();
          },
          onError: () => setError("O YouTube não permitiu reproduzir este vídeo incorporado."),
        },
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha na API do YouTube."));
    return () => { cancelled = true; };
  }, [currentTrack?.id, currentTrack?.source_type, currentTrack?.youtube_video_id]);

  useEffect(() => {
    youtubePlayer.current?.setVolume(Math.round(volume * 100));
  }, [volume]);

  useEffect(() => {
    if (currentTrack?.source_type !== "youtube" || !youtubePlayer.current || !musicState) return;
    const elapsed = musicState.status === "playing" && musicState.playback_started_at
      ? Math.max(0, (Date.now() - Date.parse(musicState.playback_started_at)) / 1000) : 0;
    youtubePlayer.current.seekTo(Math.max(0, Number(musicState.position_seconds) + elapsed), true);
    if (musicState.status === "playing" && unlocked) youtubePlayer.current.playVideo();
    else youtubePlayer.current.pauseVideo();
  }, [currentTrack?.id, currentTrack?.source_type, musicState?.current_track_id, musicState?.playback_started_at, musicState?.position_seconds, musicState?.status, unlocked]);

  async function savePlayback(trackId: string | null, status: MusicState["status"], position: number) {
    const { error: updateError } = await supabase.from("room_music_state").update({
      current_track_id: trackId,
      status,
      position_seconds: Math.max(0, position),
      playback_started_at: status === "playing" ? new Date().toISOString() : null,
      updated_by: userId,
    }).eq("room_id", roomId);
    if (updateError) setError("Apenas o mestre pode controlar a reprodução global.");
    else await refresh();
  }

  async function playTrack(track: Track) {
    if (role !== "gm") return;
    setBusy(true);
    setError("");
    await savePlayback(track.id, "playing", 0);
    setBusy(false);
  }

  async function togglePlayback() {
    if (role !== "gm" || !musicState) return;
    const currentPosition = currentTrack?.source_type === "upload"
      ? audioRef.current?.currentTime ?? Number(musicState.position_seconds)
      : currentTrack?.source_type === "youtube"
        ? youtubePlayer.current?.getCurrentTime() ?? Number(musicState.position_seconds)
        : Number(musicState.position_seconds);
    const nextStatus = musicState.status === "playing" ? "paused" : "playing";
    if (nextStatus === "playing") setUnlocked(true);
    setBusy(true);
    await savePlayback(musicState.current_track_id, nextStatus, currentPosition);
    setBusy(false);
  }

  async function uploadAudio(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || role !== "gm") return;
    if (!file.type.startsWith("audio/")) {
      setError("Selecione um arquivo de áudio.");
      return;
    }
    const title = uploadTitle.trim() || file.name.replace(/\.[^.]+$/, "");
    setBusy(true);
    setError("");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "audio";
    const path = userId + "/" + crypto.randomUUID() + "." + extension;
    const { error: uploadError } = await supabase.storage.from("music").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setError("O upload do arquivo falhou. Confira o acesso ao armazenamento.");
      setBusy(false);
      return;
    }
    const { data: track, error: insertError } = await supabase.from("music_tracks").insert({
      owner_id: userId, title, source_type: "upload", storage_path: path,
    }).select("id").single();
    if (insertError || !track) {
      await supabase.storage.from("music").remove([path]);
      setError("O arquivo foi enviado, mas não foi possível salvar a faixa.");
    } else {
      setUploadTitle("");
      await refresh();
    }
    setBusy(false);
    event.target.value = "";
  }

  async function addYoutubeTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role !== "gm") return;
    const videoId = extractYoutubeId(youtubeUrl);
    if (!videoId) {
      setError("Informe um link válido de vídeo do YouTube.");
      return;
    }
    setBusy(true);
    const { error: insertError } = await supabase.from("music_tracks").insert({
      owner_id: userId, title: youtubeTitle.trim() || "Vídeo do YouTube", source_type: "youtube", youtube_video_id: videoId,
    });
    if (insertError) setError("Não foi possível adicionar este vídeo.");
    else {
      setYoutubeUrl("");
      setYoutubeTitle("");
      await refresh();
    }
    setBusy(false);
  }

  async function enableLocalAudio() {
    setUnlocked(true);
    if (currentTrack?.source_type === "upload" && audioRef.current) {
      audioRef.current.volume = volume;
      try { await audioRef.current.play(); } catch { setUnlocked(false); setError("O navegador bloqueou a reprodução. Tente novamente."); }
    }
    if (currentTrack?.source_type === "youtube") youtubePlayer.current?.playVideo();
  }

  if (loading) return <div className="music-state">Carregando biblioteca musical…</div>;

  return (
    <section className="music-panel" aria-label="Reprodutor musical da sala">
      <div className="music-heading"><div><p className="eyebrow">Trilha sonora</p><h2>Música da mesa</h2></div><span className="music-status">{musicState?.status === "playing" ? "Reproduzindo" : musicState?.status === "paused" ? "Pausada" : "Parada"}</span></div>
      {error && <p className="music-error" role="alert">{error}</p>}
      <div className="now-playing">
        <div className="track-meta"><span className="eyebrow">Agora</span><strong>{currentTrack?.title ?? "Nenhuma faixa selecionada"}</strong><small>{currentTrack?.source_type === "youtube" ? "YouTube" : currentTrack ? "Arquivo de áudio" : "Escolha uma faixa para começar"}</small></div>
        {currentTrack?.source_type === "upload" && <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" />}
        {currentTrack?.source_type === "youtube" && <div className="youtube-frame" ref={youtubeHost} />}
        {!currentTrack && <div className="no-track">—</div>}
      </div>
      <div className="music-controls">
        {role === "gm" && <button type="button" className="button" disabled={busy || !currentTrack} onClick={() => void togglePlayback()}>{musicState?.status === "playing" ? "Pausar" : "Reproduzir"}</button>}
        {!unlocked && currentTrack && <button type="button" className="button button-primary" onClick={() => void enableLocalAudio()}>Ativar áudio neste dispositivo</button>}
        <label className="volume-control">Volume local <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label>
      </div>
      {role === "gm" && <>
        <div className="library-heading"><h3>Biblioteca</h3><span>{tracks.length} faixas</span></div>
        <div className="track-list">
          {tracks.map((track) => <div className="track-item" key={track.id}>
            <div><strong>{track.title}</strong><small>{track.source_type === "youtube" ? "YouTube" : "Áudio enviado"}</small></div>
            <button className="quiet-action" type="button" disabled={busy} onClick={() => void playTrack(track)}>Tocar</button>
          </div>)}
          {tracks.length === 0 && <p className="empty-library">Sua biblioteca ainda está vazia.</p>}
        </div>
        <div className="music-add">
          <form onSubmit={addYoutubeTrack}>
            <label htmlFor="youtube-title">Adicionar do YouTube</label>
            <input id="youtube-title" value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} placeholder="Nome da faixa (opcional)" />
            <input value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="Link de vídeo do YouTube" aria-label="Link de vídeo do YouTube" />
            <button className="quiet-action" type="submit" disabled={busy}>Adicionar vídeo</button>
          </form>
          <div className="upload-row">
            <label htmlFor="audio-title">Enviar arquivo de áudio</label>
            <input id="audio-title" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} placeholder="Nome da faixa (opcional)" />
            <input type="file" accept="audio/*" onChange={(event) => void uploadAudio(event)} disabled={busy} />
          </div>
        </div>
      </>}
      <p className="music-footnote">A faixa e a posição são compartilhadas. O volume é individual e o navegador pode exigir uma interação para liberar o áudio.</p>
    </section>
  );
}
