// src/pages/Cedula322Page.jsx
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Ordena ENE/JUN antes que AGO/DIC
function cicloKey(c) {
  const m = String(c).match(/^(\d{4}).*?(ENE\/JUN|AGO\/DIC)/i)
  const year = m ? parseInt(m[1], 10) : 0
  const sem  = m && m[2] ? (m[2].toUpperCase().includes('ENE') ? 1 : 2) : 0
  return year * 10 + sem
}

export default function Cedula322Page() {
  // lee ?programa del URL (si viene)
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const programaInicial = urlParams.get('programa') || 'AEROESPACIAL'

  const [programas, setProgramas] = useState([])
  const [programaSel, setProgramaSel] = useState(programaInicial)

  const [ciclos, setCiclos] = useState([])
  const [cicloSel, setCicloSel] = useState('')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [topN, setTopN] = useState(15)

  // cargar programas
  useEffect(() => {
    let cancel = false
    setLoading(true)
    axios.get(`${API}/api/meta/programas`)
      .then(res => {
        if (cancel) return
        const lista = (res.data || []).map(r => (r.programa || '').trim()).filter(Boolean)
        setProgramas(lista)
        if (!lista.includes(programaSel) && lista.length) setProgramaSel(lista[0])
      })
      .catch(err => setError(err?.message || 'Error cargando programas'))
      .finally(() => !cancel && setLoading(false))
    return () => { cancel = true }
  }, [])

  // cargar ciclos del programa (usamos el endpoint de inscritos por ciclo)
  useEffect(() => {
    if (!programaSel) return
    let cancel = false
    setError(null)
    axios.get(`${API}/api/inscritos_por_ciclo`, { params: { programa_like: programaSel }})
      .then(res => {
        if (cancel) return
        const list = (res.data || [])
          .map(x => x.ciclo)
          .filter((v, i, arr) => v && arr.indexOf(v) === i)
          .sort((a,b)=> cicloKey(a) - cicloKey(b))
        setCiclos(list)
        // selecciona el más reciente por defecto
        if (list.length) setCicloSel(list[list.length - 1])
      })
      .catch(err => setError(err?.message || 'Error cargando ciclos'))
    return () => { cancel = true }
  }, [programaSel])

  // sincroniza el ?programa= en la URL cuando cambia la selección
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    params.set('programa', programaSel)
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }, [programaSel])

  // carga datos de cédula 322
  useEffect(() => {
    if (!programaSel || !cicloSel) return
    let cancel = false
    setLoading(true)
    setError(null)
    axios.get(`${API}/api/cedula_322_detalle`, {
      params: { programa_like: programaSel, ciclo: cicloSel }
    })
      .then(res => { if (!cancel) setRows(res.data || []) })
      .catch(err => { if (!cancel) setError(err?.message || 'Error cargando Cédula 322') })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [programaSel, cicloSel])

  // datos ordenados por % desc
  const porPct = useMemo(() => {
    const arr = [...rows].sort((a,b) => (Number(b.Porcentaje)||0) - (Number(a.Porcentaje)||0))
    return topN ? arr.slice(0, topN) : arr
  }, [rows, topN])

  // datos ordenados por inscritos desc
  const porInscritos = useMemo(() => {
    const arr = [...rows].sort((a,b) => (Number(b['No. Inscritos'])||0) - (Number(a['No. Inscritos'])||0))
    return topN ? arr.slice(0, topN) : arr
  }, [rows, topN])

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>CACEI · Cédula 322</h1>
          <p style={{ marginTop: 0, opacity: .75 }}>
            Materias con inscritos, promedio del grupo y % de alumnos con calificación ≥ al promedio (por ciclo).
          </p>
        </div>
        <Link
          to={`/dashboard?programa=${encodeURIComponent(programaSel)}`}
          style={{ textDecoration:'none', fontWeight:600 }}
          title="Volver al dashboard"
        >
          ← Volver al dashboard
        </Link>
      </div>

      {/* Controles */}
      <div style={{ display:'grid', gridTemplateColumns:'minmax(220px,1fr) repeat(2, max-content)', gap:12, alignItems:'center', margin:'12px 0 20px' }}>
        <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <span style={{ fontSize:12, opacity:.8 }}>Programa</span>
          <select value={programaSel} onChange={e=>setProgramaSel(e.target.value)} style={{ padding:8 }}>
            {programas.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <span style={{ fontSize:12, opacity:.8 }}>Ciclo</span>
          <select value={cicloSel} onChange={e=>setCicloSel(e.target.value)} style={{ padding:8 }}>
            {ciclos.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <span style={{ fontSize:12, opacity:.8 }}>Top N (0 = todos)</span>
          <input type="number" min="0" value={topN} onChange={e=>setTopN(Number(e.target.value||0))} style={{ padding:8, width:120 }}/>
        </label>
      </div>

      {loading && <div>Cargando…</div>}
      {!loading && error && <div style={{color:'crimson'}}>{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div style={{opacity:.7}}>Sin datos para {programaSel} en {cicloSel}.</div>
      )}

      {/* Gráficas */}
      {!loading && !error && rows.length > 0 && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div style={{background:'#fff', border:'1px solid #eee', borderRadius:8, padding:12}}>
              <h3 style={{margin:'0 0 8px'}}>Top {topN || 'N'} por % ≥ promedio</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porPct}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Clave" />
                  <YAxis unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Porcentaje" name="% ≥ prom." fill="#10B981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{background:'#fff', border:'1px solid #eee', borderRadius:8, padding:12}}>
              <h3 style={{margin:'0 0 8px'}}>Top {topN || 'N'} por inscritos</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porInscritos}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="Clave" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="No. Inscritos" name="Inscritos" fill="#6366F1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabla */}
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse', width:'100%'}}>
              <thead>
                <tr>
                  <th style={th}>Clave</th>
                  <th style={th}>Materia</th>
                  <th style={thCenter}>Semestre</th>
                  <th style={thRight}>No. Inscritos</th>
                  <th style={thRight}>Promedio</th>
                  <th style={thRight}>Arriba del promedio</th>
                  <th style={thRight}>Porcentaje</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.Clave}-${r.Ciclo}-${i}`} style={{borderTop:'1px solid #eee'}}>
                    <td style={td}>{r.Clave}</td>
                    <td style={td}>{r.Materia}</td>
                    <td style={tdCenter}>{r.Semestre}</td>
                    <td style={tdRight}>{r['No. Inscritos']}</td>
                    <td style={tdRight}>{Number(r.Promedio).toFixed(1)}</td>
                    <td style={tdRight}>{r['Arriba del promedio']}</td>
                    <td style={tdRight}>{Number(r.Porcentaje).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{marginTop:8, opacity:.7}}>
              {rows.length} materias en {cicloSel} ({programaSel}).
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const th = { textAlign:'left', padding:'8px 6px', background:'#f7f7f7', borderBottom:'1px solid #ddd' }
const thRight = { ...th, textAlign:'right' }
const thCenter = { ...th, textAlign:'center' }
const td = { padding:'8px 6px' }
const tdRight = { ...td, textAlign:'right' }
const tdCenter = { ...td, textAlign:'center' }
