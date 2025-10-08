// src/components/ReprobacionMaterias.jsx
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ordena ENE/JUN antes que AGO/DIC dentro del mismo año
function cicloKey(c) {
  const m = String(c).match(/^(\d{4}).*?(ENE\/JUN|AGO\/DIC)/i)
  const year = m ? parseInt(m[1], 10) : 0
  const sem  = m && m[2] ? (m[2].toUpperCase().includes('ENE') ? 1 : 2) : 0
  return year * 10 + sem
}

// Normaliza strings para agrupar nombres equivalentes
function normalizeName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim().replace(/\s+/g, ' ')                      // espacios
    .toUpperCase()
}

export default function ReprobacionMaterias({
  programa = 'AEROESPACIAL',
  aprobatoria = 6.0,
  topN = 30,
  cicloDefault, // opcional, ej: "2022-SEM-AGO/DIC"
  onRowsChange, // <--- NUEVO
}) {
  const [ciclos, setCiclos] = useState([])
  const [ciclo, setCiclo]   = useState(cicloDefault || '')
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [soloConReprob, setSoloConReprob] = useState(false)

  // Cargar ciclos detectados
  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const r = await axios.get(`${API}/api/inscritos_por_ciclo`, {
          params: { programa_like: programa }
        })
        const list = [...(r.data || [])]
          .map(x => x.ciclo)
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
          .sort((a, b) => cicloKey(a) - cicloKey(b))

        if (!cancel) {
          setCiclos(list)
          if (!cicloDefault && list.length) {
            setCiclo(list[list.length - 1]) // más reciente
          } else if (cicloDefault) {
            setCiclo(cicloDefault)
          }
        }
      } catch {
        if (!cancel) setError('No se pudieron cargar los ciclos')
      }
    })()
    return () => { cancel = true }
  }, [programa, cicloDefault])

  // Cargar detalle por materia
  useEffect(() => {
    if (!ciclo) return
    let cancel = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const r = await axios.get(`${API}/api/reprobacion_detalle`, {
          params: { programa_like: programa, ciclo, aprobatoria }
        })
        if (cancel) return
        const norm = (r.data || []).map(x => ({
          clave: x['Clave'] ?? x.clave,
          nombre: x['Nombre de la Materia'] ?? x.nombre,
          ciclo: x['Ciclo'] ?? x.ciclo,
          semestre: x['Semestre'] ?? x.semestre,
          alumnos: Number(x['No. Alumnos'] ?? x.alumnos) || 0,
          reprobados: Number(x['No. Reprobados'] ?? x.reprobados) || 0,
          porcentaje: Number(x['Porcentaje'] ?? x.porcentaje) || 0,
          umbral_usado: Number(x['umbral_usado'] ?? x.umbral_usado ?? aprobatoria)
        }))
        setRows(norm)
        // Consolidar duplicados por (clave, nombre, ciclo, semestre)
        const map = new Map()
        for (const r of norm) {
          const key = [r.clave, r.nombre, r.ciclo, r.semestre].join('|')
          const prev = map.get(key) || { ...r, alumnos: 0, reprobados: 0 }
          prev.alumnos += Number(r.alumnos) || 0
          prev.reprobados += Number(r.reprobados) || 0
          map.set(key, prev)
        }
        const consolidados = Array.from(map.values()).map(r => ({
          ...r,
          porcentaje: r.alumnos ? (100 * r.reprobados / r.alumnos) : 0
        }))

        // Entregar los consolidados al padre (para gráficas)
        if (typeof onRowsChange === 'function') {
          onRowsChange(consolidados)
        }
      } catch {
        setError('No se pudo cargar la reprobación por materia')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [programa, ciclo, aprobatoria])

  // Umbral (si el backend lo devuelve por fila, tomamos el primero)
  const umbralUsado = useMemo(() => {
    if (!rows.length) return aprobatoria
    return rows[0]?.umbral_usado ?? aprobatoria
  }, [rows, aprobatoria])

  // *** Consolidación por (clave + nombre normalizado) ***
  const consolidadas = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const clave = String(r.clave || '').trim().toUpperCase()
      const nombreNorm = normalizeName(r.nombre || '(SIN NOMBRE)')
      const key = `${clave}|${nombreNorm}`

      const prev = map.get(key) || {
        clave,
        nombre: nombreNorm,     // mostramos ya normalizado
        ciclo: r.ciclo,
        semestre: Number.isFinite(r.semestre) ? r.semestre : 0,
        alumnos: 0,
        reprobados: 0,
        umbral_usado: r.umbral_usado
      }

      // Suma de métricas
      prev.alumnos   += r.alumnos
      prev.reprobados += r.reprobados

      // Semestre: toma el menor si difiere
      const sem = Number.isFinite(r.semestre) ? r.semestre : 0
      prev.semestre = Math.min(prev.semestre ?? sem, sem)

      map.set(key, prev)
    }

    // Recalcula porcentaje
    const out = Array.from(map.values()).map(it => ({
      ...it,
      porcentaje: it.alumnos ? (100 * it.reprobados / it.alumnos) : 0
    }))

    // Orden: % desc, luego clave
    out.sort((a, b) => {
      const d = (b.porcentaje || 0) - (a.porcentaje || 0)
      if (d !== 0) return d
      return String(a.clave).localeCompare(String(b.clave))
    })

    return out
  }, [rows])

  // Aplicar filtros / topN
  const shown = useMemo(() => {
    let arr = [...consolidadas]
    if (soloConReprob) arr = arr.filter(r => Number(r.porcentaje) > 0)
    return topN ? arr.slice(0, topN) : arr
  }, [consolidadas, soloConReprob, topN])

  return (
    <div>
      {/* Controles */}
      <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', margin:'8px 0 16px'}}>
        <label>
          <span style={{marginRight:6}}>Ciclo:</span>
          <select value={ciclo} onChange={e=>setCiclo(e.target.value)}>
            {ciclos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <input
            type="checkbox"
            checked={soloConReprob}
            onChange={e => setSoloConReprob(e.target.checked)}
          />
          Solo materias con %&nbsp;&gt;&nbsp;0
        </label>

        <span style={{opacity:.7}}>
          Programa: <b>{programa}</b> · Aprobatoria solicitada: <b>{Number(aprobatoria).toFixed(1)}</b> · Umbral usado: <b>{Number(umbralUsado).toFixed(1)}</b>
        </span>
      </div>

      {/* Estados */}
      {loading && <div>Cargando…</div>}
      {!loading && error && <div style={{color:'crimson'}}>{error}</div>}
      {!loading && !error && shown.length === 0 && (
        <div style={{opacity:.7}}>Sin datos para {programa} en {ciclo}.</div>
      )}

      {/* Tabla */}
      {!loading && !error && shown.length > 0 && (
        <div style={{overflowX:'auto'}}>
          <table style={{borderCollapse:'collapse', width:'100%'}}>
            <thead>
              <tr>
                <th style={th}>Clave</th>
                <th style={th}>Nombre de la Materia</th>
                <th style={th}>Semestre</th>
                <th style={th}>No. Alumnos</th>
                <th style={th}>No. Reprobados</th>
                <th style={th}>Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r,i)=>(
                <tr key={`${r.clave}-${i}`} style={{borderTop:'1px solid #eee'}}>
                  <td style={td}>{r.clave}</td>
                  <td style={td}>{r.nombre}</td>
                  <td style={tdCenter}>{r.semestre}</td>
                  <td style={tdRight}>{r.alumnos}</td>
                  <td style={tdRight}>{r.reprobados}</td>
                  <td style={tdRight}>{Number(r.porcentaje).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:8, opacity:.7}}>
            Mostrando {shown.length} materias {soloConReprob ? '(solo con % > 0)' : ''}.
          </div>
        </div>
      )}
    </div>
  )
}

const th = { textAlign:'left', padding:'8px 6px', background:'#f7f7f7', borderBottom:'1px solid #ddd' }
const td = { padding:'8px 6px' }
const tdRight = { ...td, textAlign:'right' }
const tdCenter = { ...td, textAlign:'center' }
