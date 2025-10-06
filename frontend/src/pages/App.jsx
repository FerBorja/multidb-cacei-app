import React, { useEffect, useState } from 'react'
import axios from 'axios'
import Inscritos from './Inscritos.jsx'
import Reprobacion from './Reprobacion.jsx'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function App(){
  const [programas, setProgramas] = useState([])
  useEffect(()=>{
    axios.get(`${API}/api/meta/programas`).then(r=>setProgramas(r.data))
  },[])
  return (
    <div style={{padding:20, fontFamily:'sans-serif'}}>
      <h1>CACEI Estadísticas (Aeroespacial)</h1>
      <p>API: {API}</p>
      <Inscritos />
      <Reprobacion />
      <div style={{marginTop: 40}}>
        <h3>Programas detectados</h3>
        <ul>
          {programas.map(p=> <li key={p.programa}>{p.programa}</li>)}
        </ul>
      </div>
    </div>
  )
}
