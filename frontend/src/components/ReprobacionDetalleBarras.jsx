import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

function truncate(s = '', n = 36) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export default function ReprobacionDetalleBarras({ rows, titulo = 'Índice de Reprobación por Materia', cicloLabel }) {
  const data = rows.map(r => ({
    name: `${r['Clave']} · ${truncate(r['Nombre de la Materia'] || '(sin nombre)')}`,
    porcentaje: Number(r['Porcentaje'] ?? 0),
    reprobados: Number(r['No. Reprobados'] ?? 0),
    alumnos: Number(r['No. Alumnos'] ?? 0),
    semestre: r['Semestre'],
  }))

  const fmtPct = (v) => `${Number(v).toFixed(1)}%`
  const tooltipFormatter = (value, name, { payload }) => {
    if (name === 'porcentaje') {
      return [`${fmtPct(value)} (${payload.reprobados}/${payload.alumnos})`, 'Reprobación']
    }
    return [value, name]
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: 0 }}>{titulo}</h3>
      {cicloLabel && <small>Ciclo: {cicloLabel}</small>}
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 28)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={fmtPct} />
          <YAxis type="category" dataKey="name" width={380} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          <Bar dataKey="porcentaje" name="Reprobación" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
