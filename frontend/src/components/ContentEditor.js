import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api, { getTracks, getFolders, getPlaylists } from '../api/client';

export const DRAG_TYPE = 'application/x-radiostation';
export function dragData(e, data) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(data));
  e.dataTransfer.effectAllowed = data.kind === 'item' ? 'move' : 'copy';
}
export function readDrag(e) {
  try { return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)); } catch { return null; }
}
export function duration(sec = 0) {
  const n = Math.max(0, Math.round(sec));
  return `${Math.floor(n / 3600) ? `${Math.floor(n / 3600)}:` : ''}${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export default function ContentEditor({ kind, value, onChanged }) {
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [tab, setTab] = useState('tracks');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [dropAt, setDropAt] = useState(null);
  const [preview, setPreview] = useState(null);
  const { data: tr } = useQuery({ queryKey: ['tracks', { search, folder }], queryFn: () => getTracks({ search, ...(folder === '__none__' ? { no_folder: '1' } : folder ? { folder_id: folder } : {}) }) });
  const { data: fl } = useQuery({ queryKey: ['folders'], queryFn: getFolders });
  const { data: pl } = useQuery({ queryKey: ['playlists'], queryFn: getPlaylists });
  const rows = (x) => x?.data?.results || x?.data || [];
  const tracks = rows(tr), folders = rows(fl), playlists = rows(pl);
  const items = kind === 'shows' ? value.show_items || [] : value.playlist_tracks || [];
  const used = items.reduce((s, i) => s + (i.track.duration || 0), 0);
  const limit = kind === 'shows' ? value.duration_seconds : null;
  const owner = `${kind}/${value.id}`;
  const mutate = async (action, data) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const res = await api.post(`/${owner}/${action}/`, data);
      await onChanged(res.data);
    } catch (err) {
      setError(err.response?.data ? JSON.stringify(err.response.data) : 'No se guardó el cambio. Intenta de nuevo.');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const add = (data, position = items.length) => mutate(kind === 'shows' ? 'add_item' : 'add_track', { ...data, position });
  const reorder = (ids) => mutate('reorder', { order: ids });
  const move = (from, to) => {
    if (from < 0 || to < 0 || to >= items.length) return;
    const order = items.map(i => i.id); const [id] = order.splice(from, 1); order.splice(to, 0, id); reorder(order);
  };
  const drop = (e, position) => {
    e.preventDefault(); e.stopPropagation(); setDropAt(null);
    if (busyRef.current) return;
    const d = readDrag(e); if (!d) return;
    if (d.kind === 'item' && d.owner === owner) {
      const from = items.findIndex(i => i.id === d.id);
      if (from < 0) return;
      const order = items.map(i => i.id); order.splice(from, 1); order.splice(position > from ? position - 1 : position, 0, d.id);
      reorder(order);
    } else if (d.kind === 'tracks') add({ track_ids: d.ids }, position);
    else if (d.kind === 'playlist') add({ playlist_id: d.id }, position);
  };
  const zone = (pos) => <div key={`drop-${pos}`} className={`radio-drop ${dropAt === pos ? 'active' : ''}`}
    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropAt(pos); }}
    onDragLeave={() => setDropAt(null)} onDrop={e => drop(e, pos)}>
    {items.length === 0 ? 'Arrastra aquí pistas o una playlist' : 'Insertar aquí'}
  </div>;
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return <div className="radio-editor" aria-busy={busy}>
    {error && <div role="alert" className="radio-error">{error}</div>}
    <div className="radio-editor-summary">
      <strong>{items.length} pistas · {duration(used)}</strong>
      {limit != null && <span style={{ color: used > limit ? 'var(--red)' : 'var(--text-secondary)' }}>
        {used > limit ? `${duration(used-limit)} de exceso (se corta al finalizar el show)` : `${duration(limit-used)} disponibles`}
      </span>}
      {busy && <span role="status">Guardando…</span>}
    </div>
    {kind === 'shows' && (value.repeat !== 'none' || value.parent_show) && <p className="radio-help">El contenido se comparte con la serie y sus próximas repeticiones.</p>}
    <div className="radio-editor-columns">
      <section className="radio-library">
        <h3>Biblioteca</h3>
        <div className="radio-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => setTab('tracks')}>Pistas</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab('playlists')}>Playlists</button>
        </div>
        <input aria-label="Buscar contenido" placeholder="Buscar título o artista…" value={search} onChange={e => setSearch(e.target.value)} />
        {tab === 'tracks' && <>
          <select aria-label="Carpeta" value={folder} onChange={e => setFolder(e.target.value)}>
            <option value="">Todas las carpetas</option><option value="__none__">Sin carpeta</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name} ({f.track_count})</option>)}
          </select>
          <div className="radio-toolbar"><button className="btn btn-secondary btn-sm" onClick={() => setSelected(tracks.map(t => t.id))}>Seleccionar visibles</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !selected.length} onClick={() => add({ track_ids: selected })}>+ {selected.length} seleccionadas</button>
            {!!selected.length && <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>Limpiar</button>}</div>
        </>}
        <div className="radio-library-list">
          {tab === 'tracks' ? tracks.map(t => <div className="radio-content-row" key={t.id} draggable={!busy}
            onDragStart={e => dragData(e, { kind: 'tracks', ids: selected.includes(t.id) ? selected : [t.id] })}>
            <input type="checkbox" aria-label={`Seleccionar ${t.title}`} checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
            <button title="Preescuchar solo en este navegador" className="radio-icon" onClick={() => setPreview(t)}>▶</button>
            <div className="radio-track-info"><strong>{t.title}</strong><small>{t.artist || '—'}</small></div>
            <span>{duration(t.duration)}</span><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => add({ track_id: t.id })}>+</button>
          </div>) : playlists.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <div className="radio-content-row" key={p.id} draggable={!busy}
            onDragStart={e => dragData(e, { kind: 'playlist', id: p.id })}>
            <div className="radio-track-info"><strong>{p.name}</strong><small>{p.track_count} pistas · {duration(p.total_duration)}</small></div>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => add({ playlist_id: p.id })}>+ Todo</button>
          </div>)}
        </div>
      </section>
      <section className="radio-running-order">
        <h3>Orden de reproducción</h3>
        <p className="radio-help">Arrastra para insertar o reordenar. Las flechas también permiten mover pistas.</p>
        <button className="btn btn-secondary btn-sm" disabled={busy || items.length < 2} onClick={() => {
          const ids = items.map(i => i.id);
          for (let i=ids.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
          reorder(ids);
        }}>Mezclar orden</button>
        <div className="radio-order-list" onDragOver={e => e.preventDefault()} onDrop={e => drop(e, items.length)}>
          {items.map((item, i) => <React.Fragment key={item.id}>{zone(i)}
            <div className="radio-content-row" draggable={!busy} onDragStart={e => dragData(e, { kind:'item', owner, id:item.id })}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropAt(i); }} onDrop={e => drop(e, i)}>
              <span title="Arrastrar">⠿ {i+1}</span><button className="radio-icon" title="Preescuchar" onClick={() => setPreview(item.track)}>▶</button>
              <div className="radio-track-info"><strong>{item.track.title}</strong><small>{item.track.artist || '—'} · desde {duration(items.slice(0,i).reduce((a,x)=>a+x.track.duration,0))}</small></div>
              <span>{duration(item.track.duration)}</span>
              <div className="radio-row-buttons"><button className="radio-icon" title="Subir" disabled={busy || !i} onClick={() => move(i,i-1)}>↑</button>
              <button className="radio-icon" title="Bajar" disabled={busy || i===items.length-1} onClick={() => move(i,i+1)}>↓</button>
              <button className="radio-icon" title="Quitar del contenido" disabled={busy} onClick={() => mutate(kind==='shows'?'remove_item':'remove_track',{item_id:item.id})}>×</button></div>
            </div></React.Fragment>)}{zone(items.length)}
        </div>
      </section>
    </div>
    {preview && <div className="radio-preview"><span>Preescucha: {preview.title}</span><audio key={preview.id} src={preview.file} controls autoPlay /><button className="radio-icon" onClick={()=>setPreview(null)}>×</button></div>}
  </div>;
}
