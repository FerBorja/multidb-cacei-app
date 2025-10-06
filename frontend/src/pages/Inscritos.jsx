import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function Inscritos(){
  const [data, setData] = useState([])
  useEffect(()=>{
    axios.get(`${API}/api/inscritos_por_ciclo?programa_like=AEROESPACIAL`).then(r=>setData(r.data))
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
