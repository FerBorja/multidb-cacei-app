# CACEI MultiDB Stats (Aeroespacial) – Starter

Este starter levanta **MySQL + Adminer + FastAPI + React** y expone endpoints y gráficas que replican hojas clave de **Estadisticas CACEI Aeroespacial.xlsx** (Inscritos por Ciclo, Índice de Reprobación, Cohortes, etc.).

## 1) Coloca tus dumps
Copia tus archivos `.sql` en `docker/mysql/dumps/`. Al levantar MySQL se van a importar automáticamente.

## 2) Levantar entorno
```bash
docker compose up -d --build
# Verifica Adminer: http://localhost:18080  (Server: mysql, User: root, Pass: rootpass)
# API:             http://localhost:8000/docs
# Frontend:        http://localhost:5173
```

Si MySQL ya está arriba y quieres re-importar manualmente:
```bash
bash docker/mysql/import-dumps.sh
```

## 3) Endpoints principales
- `GET /api/health` — prueba de conexión / bases visibles.
- `GET /api/meta/programas` — programas detectados (para filtros).
- `GET /api/inscritos_por_ciclo?programa_like=AEROESPACIAL`
- `GET /api/reprobacion?programa_like=AEROESPACIAL&aprobatoria=70`
- `GET /api/desercion?programa_like=AEROESPACIAL`
- `GET /api/cohorte?ciclo_ingreso=2019-A&programa_like=AEROESPACIAL`
- `GET /api/cedula_322?programa_like=AEROESPACIAL` (placeholder)

> El SQL usa `estadistica.boletas` y `ingenieria.alumnos` como fuentes; ajústalo según tus estructuras reales.

## 4) Mapeo con el Excel
- **Inscritos por Ciclo**: conteo de `boletas` por `ciclo` filtrando la `carrera` aeroespacial.
- **Índice de Reprobación**: % `calificacion < 70` por `ciclo` en `boletas`.
- **Deserción**: aproximada usando `estatus` de `alumnos` (ajusta expresiones REGEXP).
- **Cohorte**: actividad por `ciclo` de `alumnos` con `ciclo_ingreso` dado.
- **Formas de Titulación / Cédula 322**: requiere fuentes no presentes en los dumps — endpoint placeholder.

## 5) Variables de entorno (backend)
- `DB_HOST` (default: mysql)
- `DB_PORT` (default: 3306)
- `DB_USER` (default: root)
- `DB_PASS` (default: rootpass)
- `DB_DEFAULT_SCHEMA` (no se usa directamente; consultas usan `schema.tabla`).

## 6) Notas de esquema
Este proyecto asume tablas como:
- `estadistica.boletas(matricula, carrera, ciclo, clave, calificacion, ...)`
- `ingenieria.alumnos(matricula, desc_programa, ciclo_ingreso, ultimo_ciclo_kardex, estatus, genero, ...)`

Ajusta los SELECT en `backend/app/routers/stats.py` si difieren.

---

Made for Luis — listo para iterar con más KPIs del Excel.
