import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function cicloKey(c) {
  const m = String(c).match(/^(\d{4}).*?(ENE\/JUN|AGO\/DIC)/i)
  const year = m ? parseInt(m[1], 10) : 0
  const sem  = m && m[2] ? (m[2].toUpperCase().includes('ENE') ? 1 : 2) : 0
  return year * 10 + sem
}

export default function Inscritos({ programa = 'AEROESPACIAL' }) {
  const [data, setData] = useState([])

  useEffect(() => {
    axios.get(`${API}/api/inscritos_por_ciclo`, {
      params: { programa_like: programa }
    }).then(r => {
      const ordered = [...r.data].sort((a,b)=> cicloKey(a.ciclo) - cicloKey(b.ciclo))
      setData(ordered)
    })
  }, [programa])

  return (
    <div style={{ marginTop: 20 }}>
      <h2>Inscritos por Ciclo</h2>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="ciclo" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="inscritos" name="Inscritos" dot={false} stroke="#10B981" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{marginTop:8, opacity:.7}}>Programa: <b>{programa}</b></div>
    </div>
  )
}
