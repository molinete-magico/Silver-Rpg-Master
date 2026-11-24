import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

type ShareRequest = { id: string; requester_id: string; status: "pending" | "approved" | "denied" | "cancelled" | "stopped"; created_at: string };
type Props = { roomId: string; userId: string; role: "gm" | "player" };

export default function ScreenShare({ roomId, userId, role }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [requests, setRequests] = useState<ShareRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Conectando ao serviço de compartilhamento…");

  const loadRequests = useCallback(async () => {
    const { data, error: queryError } = await supabase.from("screen_share_requests")
      .select("id, requester_id, status, created_at")
      .eq("room_id", roomId).order("created_at", { ascending: false });
    if (queryError) setError("Não foi possível carregar as solicitações.");
    else setRequests((data ?? []) as ShareRequest[]);
  }, [roomId, supabase]);

  const connect = useCallback(async (publish: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
      const response = await fetch("/api/rooms/livekit-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room_id: roomId, publish }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.token || !payload.url) throw new Error(payload.error ?? "Não foi possível obter acesso ao compartilhamento.");

      const room = new Room({ adaptiveStream: true, dynacast: true });
      room.on(RoomEvent.TrackSubscribed, (track, publication) => {
        if (publication.source === Track.Source.ScreenShare && videoRef.current) {
          track.attach(videoRef.current);
          setStatus("Uma tela está sendo compartilhada.");
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          track.detach();
          setStatus("Aguardando compartilhamento de tela.");
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, () => setSharing(false));
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setSharing(false);
      });
      await room.connect(payload.url, payload.token);
      roomRef.current = room;
      setConnected(true);
      setStatus("Conectado. Aguardando uma tela compartilhada.");
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.trackPublications.values()) {
          if (publication.source === Track.Source.ScreenShare && publication.track && videoRef.current) {
            publication.track.attach(videoRef.current);
            setStatus("Uma tela está sendo compartilhada.");
          }
        }
      }
      if (publish) {
        await room.localParticipant.setScreenShareEnabled(true);
        setSharing(true);
        setStatus("Você está compartilhando sua tela.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar ao LiveKit.");
      setStatus("Compartilhamento indisponível.");
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadRequests();
    const channel = supabase.channel("screen-share-" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "screen_share_requests", filter: "room_id=eq." + roomId }, () => void loadRequests())
      .subscribe();
    void connect(false);
    return () => {
      void supabase.removeChannel(channel);
      if (roomRef.current) void roomRef.current.disconnect();
    };
  }, [connect, loadRequests, roomId, supabase]);

  const ownRequest = requests.find((request) => request.requester_id === userId && (request.status === "pending" || request.status === "approved"));
  const activeApproval = requests.find((request) => request.status === "approved");

  async function requestShare() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/rooms/screen-share/request", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room_id: roomId }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error ?? "Não foi possível solicitar o compartilhamento.");
    await loadRequests();
    setBusy(false);
  }

  async function review(requestId: string, nextStatus: "approved" | "denied") {
    setBusy(true);
    setError("");
    const response = await fetch("/api/rooms/screen-share/review", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request_id: requestId, status: nextStatus }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error ?? "Não foi possível revisar a solicitação.");
    await loadRequests();
    setBusy(false);
  }

  async function stopRequest(requestId: string, self: boolean) {
    setBusy(true);
    setError("");
    const response = await fetch(self ? "/api/rooms/screen-share/stop-self" : "/api/rooms/screen-share/stop", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request_id: requestId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? "Não foi possível interromper o compartilhamento.");
    await loadRequests();
    await connect(false);
    setBusy(false);
  }

  async function stopLocalSharing() {
    const room = roomRef.current;
    if (room) await room.localParticipant.setScreenShareEnabled(false);
    setSharing(false);
    await connect(false);
  }

  async function startSharing() {
    const approved = ownRequest?.status === "approved";
    if (role !== "gm" && !approved) return;
    await connect(true);
  }

  return (
    <section className="screen-panel" aria-label="Compartilhamento de tela">
      <div className="screen-heading">
        <div><p className="eyebrow">Apresentação</p><h2>Compartilhamento de tela</h2></div>
        <span className={connected ? "screen-state connected" : "screen-state"}>{connected ? "Conectado" : "Desconectado"}</span>
      </div>
      {error && <p className="screen-error" role="alert">{error}</p>}
      <div className="screen-view">
        <video ref={videoRef} autoPlay playsInline muted={false} />
        <p>{status}</p>
        <button type="button" className="fullscreen-button" onClick={() => void videoRef.current?.requestFullscreen()} disabled={!connected}>Tela cheia</button>
      </div>
      <div className="screen-actions">
        {role === "gm" ? (
          <button type="button" className="button button-primary" onClick={() => void startSharing()} disabled={busy || sharing}>{sharing ? "Compartilhando" : "Compartilhar minha tela"}</button>
        ) : ownRequest?.status === "approved" ? (
          <button type="button" className="button button-primary" onClick={() => void startSharing()} disabled={busy || sharing}>Iniciar compartilhamento</button>
        ) : ownRequest?.status === "pending" ? <span className="screen-hint">Solicitação enviada. Aguardando o mestre.</span> : (
          <button type="button" className="button" onClick={() => void requestShare()} disabled={busy || Boolean(activeApproval)}>Solicitar compartilhamento</button>
        )}
        {sharing && role === "gm" && <button type="button" className="quiet-action" onClick={() => void stopLocalSharing()} disabled={busy}>Parar de compartilhar</button>}
        {sharing && role === "player" && ownRequest && <button type="button" className="quiet-action" onClick={() => void stopRequest(ownRequest.id, true)} disabled={busy}>Parar de compartilhar</button>}
        {role === "gm" && activeApproval && <button type="button" className="quiet-action" onClick={() => void stopRequest(activeApproval.id, false)} disabled={busy}>Interromper compartilhamento ativo</button>}
      </div>
      {role === "gm" && <div className="share-requests">
        <div className="library-heading"><h3>Solicitações</h3><span>{requests.filter((request) => request.status === "pending").length} pendentes</span></div>
        {requests.filter((request) => request.status === "pending").map((request) => (
          <div className="share-request" key={request.id}>
            <span>Participante {request.requester_id.slice(0, 8)}</span>
            <div><button type="button" className="quiet-action" disabled={busy || Boolean(activeApproval)} onClick={() => void review(request.id, "approved")}>Aprovar</button><button type="button" className="quiet-action" disabled={busy} onClick={() => void review(request.id, "denied")}>Recusar</button></div>
          </div>
        ))}
        {requests.every((request) => request.status !== "pending") && <p className="screen-hint">Nenhuma solicitação pendente.</p>}
      </div>}
      <p className="screen-footnote">O navegador solicita permissão de compartilhamento. A publicação é limitada a fontes de tela; voz e microfone permanecem fora desta sala.</p>
    </section>
  );
}
