// src/components/ReprobacionCharts.jsx
import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Legend, Cell
} from 'recharts'

// Paleta
const COLOR_APROBADOS = '#4caf50' // verde
const COLOR_REPROBADOS = '#e53935' // rojo
const COLOR_GRID = '#e0e0e0'

// 0..100 -> verde (120°) a rojo (0°)
function pctColor(p) {
  const pct = Math.max(0, Math.min(100, Number(p) || 0))
  const hue = 120 - (120 * pct) / 100
  return `hsl(${hue}, 70%, 45%)`
}

/**
 * rows: [{ clave, nombre, semestre, alumnos, reprobados, porcentaje }, ...]
 */
export default function ReprobacionCharts({ rows = [], topN = 15 }) {
  // Totales para dona
  const totales = useMemo(() => {
    const alumnos = rows.reduce((acc, r) => acc + (Number(r.alumnos) || 0), 0)
    const reprobados = rows.reduce((acc, r) => acc + (Number(r.reprobados) || 0), 0)
    const aprobados = Math.max(alumnos - reprobados, 0)
    const pctReprob = alumnos ? (100 * reprobados) / alumnos : 0
    return { alumnos, reprobados, aprobados, pctReprob }
  }, [rows])

  // Top-N por % reprobación
  const topMaterias = useMemo(() => {
    const arr = [...rows]
      .map(r => ({
        ...r,
        porcentaje: Number(r.porcentaje) || 0,
        label: `${r.clave} · ${r.nombre}`.slice(0, 60)
      }))
      .sort((a, b) => (b.porcentaje - a.porcentaje) || String(a.clave).localeCompare(String(b.clave)))
    return topN > 0 ? arr.slice(0, topN) : arr
  }, [rows, topN])

  // Apiladas por semestre
  const porSemestre = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      const s = Number(r.semestre) || 0
      const prev = m.get(s) || { semestre: s, alumnos: 0, reprobados: 0 }
      prev.alumnos += Number(r.alumnos) || 0
      prev.reprobados += Number(r.reprobados) || 0
      m.set(s, prev)
    }
    const arr = Array.from(m.values())
    arr.forEach(x => x.aprobados = Math.max(x.alumnos - x.reprobados, 0))
    arr.sort((a, b) => a.semestre - b.semestre)
    return arr
  }, [rows])

  return (
    <div style={{ display:'grid', gap:16 }}>
      {/* KPIs */}
      <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
        <Kpi title="Alumnos (total ciclo)" value={totales.alumnos} />
        <Kpi title="Reprobados" value={totales.reprobados} />
        <Kpi title="% Reprobación" value={`${totales.pctReprob.toFixed(1)}%`} />
      </div>

      {/* Top-N materias por % reprobación */}
      <Card title={`Top ${topN || 'todas'} materias por % reprobación`}>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={topMaterias}
            layout="vertical"
            margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v)=>`${v}%`} />
            <YAxis type="category" dataKey="label" width={260} />
            <Tooltip formatter={(v)=>Array.isArray(v)?v[0]:v} />
            <Bar dataKey="porcentaje" name="% reprobación">
              {topMaterias.map((e, i) => (
                <Cell key={i} fill={pctColor(e.porcentaje)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Distribución por semestre (apiladas) */}
      <Card title="Distribución por semestre">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={porSemestre} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLOR_GRID} />
            <XAxis dataKey="semestre" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="aprobados" stackId="a" name="Aprobados" fill={COLOR_APROBADOS} />
            <Bar dataKey="reprobados" stackId="a" name="Reprobados" fill={COLOR_REPROBADOS} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Dona total */}
      <Card title="Composición total (aprobados vs reprobados)">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={[
                { name:'Aprobados', value: totales.aprobados },
                { name:'Reprobados', value: totales.reprobados },
              ]}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              label
            >
              <Cell fill={COLOR_APROBADOS} />
              <Cell fill={COLOR_REPROBADOS} />
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, padding:12 }}>
      <div style={{ fontWeight:600, marginBottom:8 }}>{title}</div>
      {children}
    </div>
  )
}

function Kpi({ title, value }) {
  return (
    <div style={{ padding:12, border:'1px solid #eee', borderRadius:12, minWidth:200 }}>
      <div style={{ fontSize:12, opacity:.7 }}>{title}</div>
      <div style={{ fontSize:28, fontWeight:700, marginTop:2 }}>{value}</div>
    </div>
  )
}
