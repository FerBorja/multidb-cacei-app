// src/components/DesercionEscolar.jsx
import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar
} from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Ordena ENE/JUN antes que AGO/DIC dentro del mismo año
function cicloKey(c) {
  const m = String(c).match(/^(\d{4}).*?(ENE\/JUN|AGO\/DIC)/i)
  const year = m ? parseInt(m[1], 10) : 0
  const sem  = m && m[2] ? (m[2].toUpperCase().includes('ENE') ? 1 : 2) : 0
  return year * 10 + sem
}

// Colores consistentes
const C = {
  BD:    '#e53935', // Baja definitiva
  BCPED: '#fb8c00', // Cambio de programa
  BCPES: '#fdd835', // Cambio de plan
  BCM:   '#8e24aa', // Cambio de modalidad
  BT:    '#00897b', // Baja temporal
  RI:    '#43a047', // Reingreso inscrito
  LINE:  '#1e88e5'  // % deserción
}

export default function DesercionEscolar({
  programa,
  restarRi = 1,           // 1 = restar RI de la deserción
  alto = 280
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError('')
    axios.get(`${API}/api/desercion_escolar`, {
      params: { programa_like: programa, restar_ri: restarRi }
    })
    .then(res => { if(!cancel) setRows(res.data || []) })
    .catch(() => { if(!cancel) setError('No se pudo cargar Deserción Escolar') })
    .finally(() => { if(!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [programa, restarRi])

  const data = useMemo(() => {
    const arr = [...rows].sort((a,b)=> cicloKey(a.Cohorte) - cicloKey(b.Cohorte))
    return arr.map(r => ({
      Cohorte: r.Cohorte,
      Porcentaje: Number(r.Porcentaje || 0),
      BD: Number(r.BD||0),
      BCPED: Number(r.BCPED||0),
      BCPES: Number(r.BCPES||0),
      BCM: Number(r.BCM||0),
      BT: Number(r.BT||0),
      RI: Number(r.RI||0),
      Desercion: Number(r.Desercion||0)
    }))
  }, [rows])

  const kpi = useMemo(() => {
    const totAlumnos = data.reduce((s, r) => s + (r.BD+r.BCPED+r.BCPES+r.BCM+r.BT+r.RI + (r.Desercion - (r.BD+r.BCPED+r.BCPES+r.BCM+r.BT - (restarRi? r.RI:0)))), 0)
    const desertores = data.reduce((s, r) => s + r.Desercion, 0)
    const totalEstBase = data.reduce((s, r) => s + (r.BD+r.BCPED+r.BCPES+r.BCM+r.BT+r.RI), 0) // aproximado
    const riTotal = data.reduce((s, r) => s + r.RI, 0)
    const pct = totalEstBase > 0 ? (desertores * 100 / totalEstBase) : 0
    return {
      totalEst: totalEstBase, desertores, riTotal, pct: Number(pct.toFixed(2))
    }
  }, [data, restarRi])

  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <h3 style={{ margin:0 }}>Deserción Escolar</h3>
        <div style={{ fontSize:12, opacity:.75 }}>
          Programa: <b>{programa}</b> · RI {restarRi ? 'se resta' : 'no se resta'}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:12 }}>
        <Kpi title="Total (aprox.)" value={kpi.totalEst} />
        <Kpi title="Desertores" value={kpi.desertores} />
        <Kpi title="% Deserción" value={`${kpi.pct}%`} />
        <Kpi title="Reingresos (RI)" value={kpi.riTotal} />
      </div>

      {loading && <div>Cargando…</div>}
      {!loading && error && <div style={{color:'crimson'}}>{error}</div>}
      {!loading && !error && data.length === 0 && <div style={{opacity:.7}}>Sin datos.</div>}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Línea: % por cohorte */}
          <div style={{ height: alto, marginBottom:16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Cohorte" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Porcentaje" stroke={C.LINE} dot={false} name="% deserción" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Barras apiladas: causas por cohorte (RI en pila separada) */}
          <div style={{ height: alto }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="Cohorte" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar stackId="causas" dataKey="BD" fill={C.BD} name="BD" />
                <Bar stackId="causas" dataKey="BCPED" fill={C.BCPED} name="BCPED" />
                <Bar stackId="causas" dataKey="BCPES" fill={C.BCPES} name="BCPES" />
                <Bar stackId="causas" dataKey="BCM" fill={C.BCM} name="BCM" />
                <Bar stackId="causas" dataKey="BT" fill={C.BT} name="BT" />
                <Bar stackId="ri"     dataKey="RI" fill={C.RI} name="RI" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ title, value }) {
  return (
    <div style={{ padding:12, border:'1px solid #eee', borderRadius:12 }}>
      <div style={{ fontSize:12, opacity:.7 }}>{title}</div>
      <div style={{ fontSize:22, fontWeight:700 }}>{value}</div>
    </div>
  )
}
