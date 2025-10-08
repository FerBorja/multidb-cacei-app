// src/components/CohorteResumen.jsx
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar,
} from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Ordena ENE/JUN antes que AGO/DIC
function cicloKey(c) {
  const m = String(c).match(/^(\d{4}).*?(ENE\/JUN|AGO\/DIC)/i)
  const year = m ? parseInt(m[1], 10) : 0
  const sem  = m && m[2] ? (m[2].toUpperCase().includes('ENE') ? 1 : 2) : 0
  return year * 10 + sem
}

// Normaliza una fila del backend (nombres con % y ordinales 1ro..9no)
function normRow(r = {}) {
  return {
    cohorte: r.cohorte ?? r.Cohorte ?? r.cohorte_generacional,
    s1: Number(r['1ro'] ?? r.s1 ?? 0),
    s2: Number(r['2do'] ?? r.s2 ?? 0),
    s3: Number(r['3ro'] ?? r.s3 ?? 0),
    s4: Number(r['4to'] ?? r.s4 ?? 0),
    s5: Number(r['5to'] ?? r.s5 ?? 0),
    s6: Number(r['6to'] ?? r.s6 ?? 0),
    s7: Number(r['7mo'] ?? r.s7 ?? 0),
    s8: Number(r['8vo'] ?? r.s8 ?? 0),
    s9: Number(r['9no'] ?? r.s9 ?? 0),
    pasantes: Number(r.Pasantes ?? r.pasantes ?? 0),
    titulados: Number(r.Titulados ?? r.titulados ?? 0),
    egresados: Number(r.Egresados ?? r.egresados ?? 0),
    pct_titulados: Number(r['%Titulados'] ?? r.pct_titulados ?? 0),
    pct_egresados: Number(r['%Egresados'] ?? r.pct_egresados ?? 0),
    ingreso: Number(r.Ingreso ?? r.ingreso ?? 0),
  }
}

const COLORS = {
  lineTitulados: '#1f77b4',
  lineEgresados: '#ff7f0e',
  barS1: '#2ca02c',
  barS4: '#d62728',
  kpiPasantes: '#9467bd',
  kpiTitulados: '#1f77b4',
  kpiEgresados: '#ff7f0e',
}

export default function CohorteResumen({ programa }) {
  // Datos para las gráficas (todas las cohortes)
  const [allRows, setAllRows] = useState([])
  const [loadingAll, setLoadingAll] = useState(true)
  const [errorAll, setErrorAll] = useState(null)

  // Cohorte seleccionada y su detalle
  const [cohortes, setCohortes] = useState([])
  const [cohorteSel, setCohorteSel] = useState('')
  const [rowSel, setRowSel] = useState(null)
  const [loadingSel, setLoadingSel] = useState(false)

  // 1) Cargar TODAS las cohortes del programa (para gráficas)
  useEffect(() => {
    let cancel = false
    setLoadingAll(true); setErrorAll(null)
    axios.get(`${API}/api/seguimiento_cohorte_resumen`, {
      params: { programa_like: programa }
    })
      .then(res => { if (!cancel) setAllRows((res.data || []).map(normRow)) })
      .catch(err => { if (!cancel) setErrorAll(err?.message || 'Error') })
      .finally(() => { if (!cancel) setLoadingAll(false) })
    return () => { cancel = true }
  }, [programa])

  // 2) Cargar lista de cohortes para el selector
  useEffect(() => {
    let cancel = false
    axios.get(`${API}/api/meta/cohortes`, { params: { programa_like: programa } })
      .then(res => {
        const list = (res.data || []).map(x => x.cohorte).filter(Boolean)
        list.sort((a,b) => cicloKey(a) - cicloKey(b))
        if (!cancel) {
          setCohortes(list)
          setCohorteSel(list[list.length - 1] || '') // más reciente
        }
      })
      .catch(() => { if (!cancel) setCohortes([]) })
    return () => { cancel = true }
  }, [programa])

  // 3) Cargar detalle de la cohorte seleccionada (KPIs/tabla)
  useEffect(() => {
    if (!cohorteSel) { setRowSel(null); return }
    let cancel = false
    setLoadingSel(true)
    axios.get(`${API}/api/seguimiento_cohorte_resumen`, {
      params: { programa_like: programa, cohorte: cohorteSel, max_semestres: 9 }
    })
      .then(res => { if (!cancel) setRowSel((res.data || [])[0] ? normRow(res.data[0]) : null) })
      .finally(() => { if (!cancel) setLoadingSel(false) })
    return () => { cancel = true }
  }, [programa, cohorteSel])

  // Ordenar para gráficas
  const sorted = useMemo(() => {
    return [...allRows].sort((a,b)=> cicloKey(a.cohorte) - cicloKey(b.cohorte))
  }, [allRows])

  // Dataset para gráfico de % (líneas)
  const pctSeries = sorted.map(r => ({
    cohorte: r.cohorte,
    pct_titulados: r.pct_titulados,
    pct_egresados: r.pct_egresados,
  }))

  // Dataset para gráfico de rezago (barras de s1 y s4)
  const rezagoSeries = sorted.map(r => ({
    cohorte: r.cohorte,
    s1: r.s1,
    s4: r.s4,
    rezago_pct: (r.s1 ? Math.round(10 * (100 * (r.s1 - r.s4) / r.s1)) / 10 : 0),
  }))

  return (
    <div style={{ display:'grid', gap:16 }}>
      <div style={{display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap'}}>
        <h2 style={{margin:0}}>Seguimiento de la Cohorte</h2>
        <span style={{opacity:.7}}>(Programa: <b>{programa}</b>)</span>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <span style={{opacity:.7}}>Cohorte:</span>
          <select value={cohorteSel} onChange={e=>setCohorteSel(e.target.value)}>
            {cohortes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs de cohorte seleccionada */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:12 }}>
        <KPI title="Pasantes" value={rowSel?.pasantes ?? 0} color={COLORS.kpiPasantes} loading={loadingSel} />
        <KPI title="Titulados" value={rowSel?.titulados ?? 0} color={COLORS.kpiTitulados} loading={loadingSel} />
        <KPI title="Egresados" value={rowSel?.egresados ?? 0} color={COLORS.kpiEgresados} loading={loadingSel} />
      </div>

      {/* Tabla 1ro..9no + % de cohorte seleccionada */}
      <div style={{background:'#fff', border:'1px solid #eee', borderRadius:8, padding:12}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
          <h3 style={{margin:0}}>Detalle de la cohorte seleccionada</h3>
          {rowSel && (
            <div style={{fontSize:12, opacity:.75}}>
              Ingreso: <b>{rowSel.ingreso}</b> · %Titulados: <b>{rowSel.pct_titulados}%</b> · %Egresados: <b>{rowSel.pct_egresados}%</b>
            </div>
          )}
        </div>
        {loadingSel && <div>Cargando…</div>}
        {!loadingSel && rowSel && (
          <div style={{overflowX:'auto'}}>
            <table style={{borderCollapse:'collapse', width:'100%'}}>
              <thead>
                <tr>
                  {['1ro','2do','3ro','4to','5to','6to','7mo','8vo','9no','Pasantes','Titulados','Egresados','%Titulados','%Egresados'].map(h=>(
                    <th key={h} style={{ textAlign:'right', padding:'6px 4px', borderBottom:'1px solid #eee', background:'#fafafa' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[rowSel.s1,rowSel.s2,rowSel.s3,rowSel.s4,rowSel.s5,rowSel.s6,rowSel.s7,rowSel.s8,rowSel.s9,
                    rowSel.pasantes,rowSel.titulados,rowSel.egresados,
                    `${rowSel.pct_titulados}%`,`${rowSel.pct_egresados}%`].map((v,i)=>(
                    <td key={i} style={{ textAlign:'right', padding:'6px 4px' }}>{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {!loadingSel && !rowSel && <div style={{opacity:.7}}>Sin datos de la cohorte seleccionada.</div>}
      </div>

      {/* Gráfica de eficiencia terminal (todas las cohortes) */}
      {!loadingAll && !errorAll && !!pctSeries.length && (
        <div style={{background:'#fff', border:'1px solid #eee', borderRadius:8, padding:12}}>
          <h3 style={{margin:'0 0 8px'}}>Eficiencia terminal (%) por cohorte</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={pctSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cohorte" />
              <YAxis unit="%" />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="pct_titulados" name="% Titulados" dot={false} stroke={COLORS.lineTitulados} />
              <Line type="monotone" dataKey="pct_egresados" name="% Egresados" dot={false} stroke={COLORS.lineEgresados} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfica de rezago 1ro→4to (todas las cohortes) */}
      {!loadingAll && !errorAll && !!rezagoSeries.length && (
        <div style={{background:'#fff', border:'1px solid #eee', borderRadius:8, padding:12}}>
          <h3 style={{margin:'0 0 8px'}}>Rezago 1ro → 4to (conteo por cohorte)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={rezagoSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="cohorte" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="s1" name="1ro" fill={COLORS.barS1} />
              <Bar dataKey="s4" name="4to" fill={COLORS.barS4} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{fontSize:12, opacity:.75, marginTop:8}}>
            * Rezago% por cohorte = (1ro - 4to) / 1ro. (Mismo denominador que en tu Excel.)
          </div>
        </div>
      )}

      {errorAll && <div style={{color:'crimson'}}>{errorAll}</div>}
    </div>
  )
}

function KPI({ title, value, color, loading }) {
  return (
    <div style={{
      background:'#fff', border:'1px solid #eee', borderRadius:8, padding:'12px 14px',
      display:'flex', flexDirection:'column', gap:4
    }}>
      <span style={{ fontSize:12, opacity:.7 }}>{title}</span>
      <span style={{ fontSize:24, fontWeight:700, color }}>{loading ? '…' : value}</span>
    </div>
  )
}
