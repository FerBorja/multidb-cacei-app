import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// --- NUEVO: helper de ordenación por ciclo
const cicloKey = (c) => {
  const s = String(c || '').toUpperCase().trim()
  const m = s.match(/^(\d{4})/)            // toma el año inicial (e.g. 2015 de "2015-SEM-ENE/JUN")
  const year = m ? parseInt(m[1], 10) : 0
  // ENE/JUN primero (1), AGO/DIC después (2)
  let sem = 99
  if (s.includes('ENE/JUN') || s.includes('ENE-JUN')) sem = 1
  else if (s.includes('AGO/DIC') || s.includes('AGO-DIC')) sem = 2
  return { year, sem }
}

export default function Inscritos(){
  const [data, setData] = useState([])
  useEffect(()=>{
    axios.get(`${API}/api/inscritos_por_ciclo?programa_like=AEROESPACIAL`).then(r=>{
      const sorted = [...r.data].sort((a, b) => {
        const ak = cicloKey(a.ciclo)
        const bk = cicloKey(b.ciclo)
        if (ak.year !== bk.year) return ak.year - bk.year       // años ascendentes
        if (ak.sem  !== bk.sem ) return ak.sem  - bk.sem        // ENE/JUN (1) antes que AGO/DIC (2)
        return String(a.ciclo).localeCompare(String(b.ciclo))    // desempate
      })
      setData(sorted)
    })
  },[])

  return (
    <div style={{marginTop:20}}>
      <h2>Inscritos por Ciclo</h2>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="ciclo" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="inscritos" dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
