import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import ReprobacionDetalleBarras from './ReprobacionDetalleBarras'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function cicloKey(c) {
  if (!c) return 0
  const year = parseInt(String(c).split('-')[0]) || 0
  const u = c.toUpperCase()
  const sem = (u.includes('ENE/JUN') || u.includes('ENE-JUN')) ? 1
            : (u.includes('AGO/DIC') || u.includes('AGO-DIC')) ? 2
            : 99
  return year * 100 + sem
}

export default function ReprobacionMaterias({
  programa = 'AEROESPACIAL',
  aprobatoria = 6,
  topN = 30
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCiclo, setSelectedCiclo] = useState('')
  const [umbralUsado, setUmbralUsado] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    axios.get(`${API}/api/reprobacion_detalle`, {
    params: { programa_like: programa, aprobatoria, ciclo: selectedCiclo }
    })
      .then(r => {
        const all = r.data || []
        // toma el umbral_usado del backend (viene en cada fila)
        const umbrales = Array.from(new Set(
            all.map(x => Number(x.umbral_usado)).filter(v => !isNaN(v))
        ))
        setUmbralUsado(umbrales[0] ?? null)
        const ciclos = Array.from(new Set(all.map(x => x['Ciclo']).filter(Boolean)))
        ciclos.sort((a, b) => cicloKey(a) - cicloKey(b))
        const def = ciclos[ciclos.length - 1] || ''
        setSelectedCiclo(def)
        setRows(all)
      })
      .catch(e => setError(e?.message || String(e)))
      .finally(() => setLoading(false))
  }, [programa, aprobatoria])

  const ciclosDisponibles = useMemo(() => {
    const set = new Set(rows.map(x => x['Ciclo']).filter(Boolean))
    const list = Array.from(set)
    list.sort((a, b) => cicloKey(a) - cicloKey(b))
    return list
  }, [rows])

  const rowsFiltrados = useMemo(() => {
    const arr = rows.filter(r => r['Ciclo'] === selectedCiclo)
    arr.sort((a, b) => Number(b['Porcentaje'] || 0) - Number(a['Porcentaje'] || 0))
    return arr.slice(0, topN)
  }, [rows, selectedCiclo, topN])

  if (loading) return <div>Cargando…</div>
  if (error) return <div style={{ color: 'crimson' }}>Error: {error}</div>
  if (!rows.length) return <div>Sin datos para {programa}.</div>

  return (
    <div style={{ marginTop: 20 }}>
      <h2>Reprobación por Materia</h2>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <label>
          <span style={{ marginRight: 6 }}>Ciclo:</span>
          <select value={selectedCiclo} onChange={e => setSelectedCiclo(e.target.value)}>
            {ciclosDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <small>
        Programa: {programa} · Aprobatoria enviada: {aprobatoria}
        {umbralUsado != null ? ` · Umbral usado: ${umbralUsado}` : ''}
        </small>
      </div>

      <ReprobacionDetalleBarras
        rows={rowsFiltrados}
        cicloLabel={selectedCiclo}
        titulo={`Índice de Reprobación — ${programa}`}
      />
    </div>
  )
}
