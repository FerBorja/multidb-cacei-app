// src/pages/ReprobacionPorMateria.jsx
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import ReprobacionMaterias from '../components/ReprobacionMaterias'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function ReprobacionPorMateria() {
  const [programas, setProgramas] = useState([])
  const [loadingPg, setLoadingPg] = useState(true)
  const [errorPg, setErrorPg] = useState(null)

  // Lee ?programa= del URL si viene
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const programaInicial = urlParams.get('programa') || 'AEROESPACIAL'

  const [programaSel, setProgramaSel] = useState(programaInicial)
  const [topN, setTopN] = useState(0) // 0 = todos
  const [aprobatoria, setAprobatoria] = useState(6) // 6.0 como pediste

  useEffect(() => {
    setLoadingPg(true)
    axios
      .get(`${API}/api/meta/programas`)
      .then(res => {
        const lista = (res.data || []).map(r => (r.programa || '').trim()).filter(Boolean)
        setProgramas(lista)

        // si el programa del URL no existe, usa el primero disponible
        if (!lista.includes(programaInicial) && lista.length > 0) {
          setProgramaSel(lista[0])
        }
      })
      .catch(err => setErrorPg(err?.message || 'Error cargando programas'))
      .finally(() => setLoadingPg(false))
  }, [API])

  // Mantén el query param sincronizado cuando cambia la selección
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('programa', programaSel)
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }, [programaSel])

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1 style={{ marginBottom: 4 }}>CACEI · Reprobación por Materia</h1>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Vista por materia en un ciclo; consolidada por clave y ordenada por % de reprobación.
      </p>

      {/* Controles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1fr) repeat(2, max-content)',
          gap: 12,
          alignItems: 'center',
          margin: '12px 0 20px',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Programa (carrera)</span>
          {loadingPg ? (
            <select disabled><option>Cargando...</option></select>
          ) : errorPg ? (
            <select disabled><option>Error al cargar</option></select>
          ) : (
            <select
              value={programaSel}
              onChange={(e) => setProgramaSel(e.target.value)}
              style={{ padding: 8 }}
            >
              {programas.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Aprobatoria</span>
          <input
            type="number"
            step="0.1"
            min="0"
            value={aprobatoria}
            onChange={(e) => setAprobatoria(Number(e.target.value || 0))}
            style={{ padding: 8, width: 90 }}
            title="Escala 0–10; el backend la normaliza si tus datos están en 0–1"
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Top N (0 = todos)</span>
          <input
            type="number"
            min="0"
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value || 0))}
            style={{ padding: 8, width: 120 }}
          />
        </label>
      </div>

      {/* Componente que pinta la tabla/gráfica */}
      <ReprobacionMaterias
        programa={programaSel}
        aprobatoria={aprobatoria}
        topN={topN}
      />
    </div>
  )
}
