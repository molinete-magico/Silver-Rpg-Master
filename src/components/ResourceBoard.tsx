import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/browser";

type Bar = { id: string; name: string; current_value: number | string; max_value: number | string; sort_order: number; updated_at: string };
type Character = { id: string; name: string; owner_id: string; resource_bars: Bar[] | null };
type Props = { roomId: string; userId: string; role: "gm" | "player" };

export default function ResourceBoard({ roomId, userId, role }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [barDrafts, setBarDrafts] = useState<Record<string, { name: string; max: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("room_characters")
      .select("characters(id, name, owner_id, resource_bars(id, name, current_value, max_value, sort_order, updated_at))")
      .eq("room_id", roomId);
    if (queryError) {
      setError("Não foi possível carregar os recursos desta sala.");
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as unknown as Array<{ characters: Character | null }>;
    setCharacters(rows.flatMap((row) => row.characters ? [row.characters] : []));
    setError("");
    setLoading(false);
  }, [roomId, supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("resources-" + roomId)
      .on("postgres_changes", { event: "*", schema: "public", table: "resource_bars" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "room_characters" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "characters" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, roomId, supabase]);

  async function addCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = characterName.trim();
    if (!name || name.length > 80) return;
    setBusy("character");
    const { data, error: insertError } = await supabase.from("characters")
      .insert({ owner_id: userId, name }).select("id").single();
    if (insertError || !data) {
      setError("Não foi possível criar o personagem.");
      setBusy(null);
      return;
    }
    const { error: linkError } = await supabase.from("room_characters").insert({
      room_id: roomId, character_id: data.id, added_by: userId,
    });
    if (linkError) {
      await supabase.from("characters").delete().eq("id", data.id);
      setError("Não foi possível vincular o personagem à sala.");
    } else {
      setCharacterName("");
      await load();
    }
    setBusy(null);
  }

  async function addBar(characterId: string) {
    const draft = barDrafts[characterId] ?? { name: "", max: "10" };
    const name = draft.name.trim();
    const max = Number(draft.max);
    if (!name || name.length > 48 || !Number.isFinite(max) || max < 0) {
      setError("Informe um nome e um valor máximo válido.");
      return;
    }
    setBusy(characterId);
    const { error: insertError } = await supabase.from("resource_bars").insert({
      character_id: characterId, name, current_value: max, max_value: max,
    });
    if (insertError) setError("Você não tem permissão para criar essa barra ou os valores são inválidos.");
    else {
      setBarDrafts((current) => ({ ...current, [characterId]: { name: "", max: "10" } }));
      await load();
    }
    setBusy(null);
  }

  async function updateBar(bar: Bar, patch: Partial<Pick<Bar, "name" | "current_value" | "max_value">>) {
    setBusy(bar.id);
    setError("");
    const { data, error: updateError } = await supabase.from("resource_bars")
      .update(patch).eq("id", bar.id).eq("updated_at", bar.updated_at).select("id").maybeSingle();
    if (updateError || !data) {
      setError(updateError ? "Não foi possível salvar a alteração." : "Esta barra mudou em outro dispositivo. Os dados foram atualizados.");
    }
    await load();
    setBusy(null);
  }

  async function deleteBar(barId: string) {
    setBusy(barId);
    const { error: deleteError } = await supabase.from("resource_bars").delete().eq("id", barId);
    if (deleteError) setError("Não foi possível excluir a barra.");
    await load();
    setBusy(null);
  }

  if (loading) return <div className="board-state">Carregando personagens e recursos…</div>;

  return (
    <section className="resource-board" aria-label="Barras de recursos dos personagens">
      <div className="board-heading">
        <div><p className="eyebrow">Recursos compartilhados</p><h2>Personagens <span>·</span> {characters.length}</h2></div>
        <span className="sync-label"><i /> Sincronização ativa</span>
      </div>
      {error && <p className="board-error" role="alert">{error}</p>}
      <form className="character-create" onSubmit={addCharacter}>
        <label htmlFor="new-character">Adicionar seu personagem à sala</label>
        <div className="inline-form">
          <input id="new-character" value={characterName} onChange={(event) => setCharacterName(event.target.value)} maxLength={80} placeholder="Nome do personagem" />
          <button className="quiet-action" type="submit" disabled={busy === "character" || !characterName.trim()}>Adicionar personagem</button>
        </div>
      </form>
      {characters.length === 0 && <div className="board-empty"><span>—</span><strong>Ainda não há personagens nesta sala.</strong><p>Adicione seu personagem para começar a compartilhar recursos com o grupo.</p></div>}
      <div className="character-list">
        {characters.map((character) => {
          const canManage = role === "gm" || character.owner_id === userId;
          const bars = [...(character.resource_bars ?? [])].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <article className="character-card" key={character.id}>
              <div className="character-heading">
                <div><p className="eyebrow">{character.owner_id === userId ? "Seu personagem" : "Personagem do grupo"}</p><h3>{character.name}</h3></div>
                <span className="bar-count">{bars.length} recursos</span>
              </div>
              {bars.length === 0 && <p className="no-bars">Nenhuma barra configurada.</p>}
              <div className="bars">
                {bars.map((bar) => {
                  const current = Number(bar.current_value);
                  const maximum = Number(bar.max_value);
                  const percent = maximum > 0 ? Math.min(100, Math.max(0, current / maximum * 100)) : 0;
                  return (
                    <div className="bar-row" key={bar.id}>
                      <div className="bar-topline">
                        {canManage ? <input className="bar-name" aria-label="Nome do recurso" defaultValue={bar.name} maxLength={48} onBlur={(event) => {
                          const name = event.currentTarget.value.trim();
                          if (name && name !== bar.name) void updateBar(bar, { name });
                          else event.currentTarget.value = bar.name;
                        }} /> : <span className="bar-name-static">{bar.name}</span>}
                        <span className="bar-values">{current} <small>/</small> {maximum}</span>
                      </div>
                      <div className="bar-track" role="progressbar" aria-label={bar.name} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={current}>
                        <span className="bar-fill" style={{ width: percent + "%" }} />
                      </div>
                      {canManage && <div className="bar-controls">
                        <button type="button" disabled={busy === bar.id || current <= 0} onClick={() => void updateBar(bar, { current_value: Math.max(0, current - 1) })} aria-label="Diminuir">−</button>
                        <input type="number" min={0} max={maximum} step="any" aria-label="Valor atual" defaultValue={current} onBlur={(event) => {
                          const next = Number(event.currentTarget.value);
                          if (Number.isFinite(next) && next >= 0 && next <= maximum && next !== current) void updateBar(bar, { current_value: next });
                          else event.currentTarget.value = String(current);
                        }} />
                        <button type="button" disabled={busy === bar.id || current >= maximum} onClick={() => void updateBar(bar, { current_value: Math.min(maximum, current + 1) })} aria-label="Aumentar">+</button>
                        <label className="max-edit">Máx.
                          <input type="number" min={0} step="any" aria-label="Valor máximo" defaultValue={maximum} onBlur={(event) => {
                            const next = Number(event.currentTarget.value);
                            if (Number.isFinite(next) && next >= current && next !== maximum) void updateBar(bar, { max_value: next });
                            else event.currentTarget.value = String(maximum);
                          }} />
                        </label>
                        <button className="remove-bar" type="button" disabled={busy === bar.id} onClick={() => void deleteBar(bar.id)}>Excluir</button>
                      </div>}
                    </div>
                  );
                })}
              </div>
              {canManage && <form className="add-bar" onSubmit={(event) => { event.preventDefault(); void addBar(character.id); }}>
                <input aria-label="Nome da nova barra" placeholder="Novo recurso" maxLength={48} value={(barDrafts[character.id] ?? { name: "", max: "10" }).name} onChange={(event) => setBarDrafts((current) => ({ ...current, [character.id]: { ...(current[character.id] ?? { name: "", max: "10" }), name: event.target.value } }))} />
                <input aria-label="Valor máximo inicial" type="number" min={0} step="any" value={(barDrafts[character.id] ?? { name: "", max: "10" }).max} onChange={(event) => setBarDrafts((current) => ({ ...current, [character.id]: { ...(current[character.id] ?? { name: "", max: "10" }), max: event.target.value } }))} />
                <button className="quiet-action" type="submit" disabled={busy === character.id}>Criar barra</button>
              </form>}
            </article>
          );
        })}
      </div>
      <p className="board-footnote">O banco verifica as permissões: o mestre pode editar todas as barras; cada jogador administra apenas os recursos dos próprios personagens.</p>
    </section>
  );
}
