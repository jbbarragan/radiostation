import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { goLive, deleteShow } from '../api/client';
import { format } from 'date-fns';
import ContentEditor from './ContentEditor';

export default function ShowDetailModal({ show, onClose, onChanged }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState(show);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scope, setScope] = useState('one');
  const series = current.parent_show || current.repeat !== 'none';
  const changed = async value => {
    setCurrent(value);
    await qc.invalidateQueries({ queryKey: ['shows'] });
    onChanged(value);
  };
  const live = async () => {
    setBusy(true); setError('');
    try { const res=await goLive(current.id); await changed(res.data); }
    catch(e) { setError(e.response?.data?.error || 'No se pudo cambiar el estado en vivo.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setError('');
    try { await deleteShow(current.id, scope); await qc.invalidateQueries({ queryKey:['shows'] }); onClose(); }
    catch(e) { setError('No se pudo eliminar. Intenta de nuevo.'); }
    finally { setBusy(false); }
  };
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="modal" style={{ maxWidth:1080, width:'95vw', maxHeight:'94vh', overflowY:'auto' }}>
      <div className="radio-editor-summary">
        <div><h3 style={{ color:current.color }}>{current.title}</h3>
          <small>{format(new Date(current.start_time),'dd MMM yyyy HH:mm')} → {format(new Date(current.end_time),'dd MMM HH:mm')}</small></div>
        <div className="radio-toolbar"><button className={`btn btn-sm ${current.is_live?'btn-live':'btn-secondary'}`} disabled={busy} onClick={live}>{current.is_live?'⏹ Stop Live':'▶ Go Live'}</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setConfirmDelete(true)}>Eliminar / cancelar</button></div>
      </div>
      {error && <div role="alert" className="radio-error">{error}</div>}
      <ContentEditor kind="shows" value={current} onChanged={changed} />
      <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Cerrar</button></div>
      {confirmDelete && <div className="modal-overlay" style={{zIndex:1100}}><div className="modal" style={{maxWidth:420}}>
        <h3>Cancelar {current.title}</h3><p>Esta acción no se puede deshacer.</p>
        {series && <select aria-label="Alcance de cancelación" value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="one">Solo esta emisión</option><option value="series">Toda la serie, incluidas todas las repeticiones</option>
        </select>}
        <div className="modal-footer"><button className="btn btn-secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Volver</button>
          <button className="btn btn-danger" disabled={busy} onClick={remove}>{scope==='series'?'Eliminar toda la serie':'Cancelar emisión'}</button></div>
      </div></div>}
    </div>
  </div>;
}
