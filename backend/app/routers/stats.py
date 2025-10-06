from fastapi import APIRouter, Query
from ..db import DB

router = APIRouter()
db = DB()

@router.get("/health")
def health():
    # Simple query to ensure connection OK (list databases)
    rows = db.q("SHOW DATABASES")
    return {"ok": True, "databases": [r["Database"] for r in rows]}

@router.get("/meta/programas")
def meta_programas(limit: int = 200):
    """
    Programas educativos detectados (desde ingenieria.alumnos/desc_programa
    y/o ingenieria.programas si existiera).
    """
    sql = """
    SELECT DISTINCT COALESCE(p.descripcion, a.desc_programa, 'SIN_PROGRAMA') AS programa
    FROM estadistica.boletas b
    LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
    LEFT JOIN ingenieria.programas p ON p.id_programa = a.id_programa
    ORDER BY 1
    LIMIT :limit
    """
    return db.q(sql, limit=limit)

@router.get("/inscritos_por_ciclo")
def inscritos_por_ciclo(programa_like: str = "AEROESPACIAL"):
    """
    Inscritos por ciclo usando boletas.ciclo y filtro por carrera/programa.
    """
    sql = """
    SELECT b.ciclo,
           COUNT(DISTINCT b.matricula) AS inscritos
    FROM estadistica.boletas b
    WHERE b.carrera LIKE :programa
    GROUP BY b.ciclo
    ORDER BY b.ciclo
    """
    return db.q(sql, programa=f"%{programa_like}%")

@router.get("/reprobacion")
def indice_reprobacion(
    programa_like: str = "AEROESPACIAL",
    aprobatoria: float = 70.0,
    contar_no_numericas: bool = False,   # NP/NA como reprobadas
):
    """
    Índice de reprobación por ciclo con autodetección de escala:
    - Si max(calif) <= 1.0  -> umbral = aprobatoria/100   (p.ej., 0.70)
    - Si max(calif) <= 10.0 -> umbral = aprobatoria/10    (p.ej., 7.0)
    - En otro caso          -> umbral = aprobatoria       (p.ej., 70)
    Solo usa calificaciones NUMÉRICAS para el denominador.
    """
    sql = """
    WITH datos AS (
      SELECT
        b.ciclo,
        TRIM(b.calificacion) AS calif_txt,
        CASE
          WHEN b.calificacion REGEXP '^[0-9]+(\\.[0-9]+)?$'
          THEN CAST(b.calificacion AS DECIMAL(10,2))
          ELSE NULL
        END AS calif_num
      FROM estadistica.boletas b
      LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
      WHERE UPPER(COALESCE(b.carrera, a.desc_programa, '')) LIKE :programa
    ),
    escala AS (
      SELECT COALESCE(MAX(calif_num), 0) AS max_val FROM datos
    ),
    params AS (
      SELECT CASE
               WHEN max_val <= 1.0  THEN :aprobatoria/100.0
               WHEN max_val <= 10.0 THEN :aprobatoria/10.0
               ELSE :aprobatoria
             END AS aprob_calc
      FROM escala
    ),
    marcaje AS (
      SELECT
        d.ciclo,
        (d.calif_num IS NOT NULL) AS es_numerica,
        CASE
          WHEN d.calif_num IS NOT NULL AND d.calif_num < p.aprob_calc THEN 1
          WHEN d.calif_num IS NULL AND :inc_non_num = 1 THEN 1
          ELSE 0
        END AS es_reprobado
      FROM datos d
      CROSS JOIN params p
    )
    SELECT
      ciclo,
      SUM(es_numerica) AS evaluadas,
      SUM(es_reprobado) AS reprobados,
      ROUND(100.0 * SUM(es_reprobado) / NULLIF(SUM(es_numerica),0), 2) AS porcentaje_reprobacion,
      (SELECT aprob_calc FROM params) AS umbral_usado
    FROM marcaje
    GROUP BY ciclo
    ORDER BY ciclo;
    """
    inc_non_num = 1 if contar_no_numericas else 0
    return db.q(
        sql,
        programa=f"%{programa_like.upper()}%",
        aprobatoria=aprobatoria,
        inc_non_num=inc_non_num,
    )

@router.get("/desercion")
def desercion(programa_like: str = "AEROESPACIAL"):
    """
    Deserción (aproximada) por ciclo usando ingenieria.alumnos.estatus.
    Se asume que estatus que contienen 'BAJA' o 'INACT' son desertores.
    Resultado por ultimo_ciclo_kardex.
    """
    sql = """
    SELECT COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso) AS ciclo,
           SUM(CASE WHEN UPPER(COALESCE(a.estatus,'')) REGEXP 'BAJA|INACT' THEN 1 ELSE 0 END) AS desertores,
           COUNT(*) AS total,
           ROUND(100.0*SUM(CASE WHEN UPPER(COALESCE(a.estatus,'')) REGEXP 'BAJA|INACT' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),2) AS porcentaje
    FROM ingenieria.alumnos a
    WHERE a.desc_programa LIKE :programa
    GROUP BY COALESCE(a.ultimo_ciclo_kardex, a.ciclo_ingreso)
    ORDER BY ciclo
    """
    return db.q(sql, programa=f"%{programa_like}%")

@router.get("/cohorte")
def seguimiento_cohorte(ciclo_ingreso: str, programa_like: str = "AEROESPACIAL"):
    """
    Seguimiento de una cohorte (alumnos con ciclo_ingreso X) y su permanencia por ciclo en boletas.
    """
    sql = """
    SELECT b.ciclo, COUNT(DISTINCT b.matricula) AS activos
    FROM estadistica.boletas b
    JOIN ingenieria.alumnos a ON a.matricula=b.matricula
    WHERE a.ciclo_ingreso = :ciclo_ingreso
      AND a.desc_programa LIKE :programa
    GROUP BY b.ciclo
    ORDER BY b.ciclo
    """
    return db.q(sql, ciclo_ingreso=ciclo_ingreso, programa=f"%{programa_like}%")

@router.get("/cedula_322")
def cedula_322(programa_like: str = "AEROESPACIAL"):
    """
    Placeholder de Cédula 322 (estructura depende de fuente externa no incluida en dumps).
    Devuelve conteos básicos por género y estatus.
    """
    sql = """
    SELECT UPPER(COALESCE(a.genero,'N/D')) AS genero,
           UPPER(COALESCE(a.estatus,'N/D')) AS estatus,
           COUNT(*) AS total
    FROM ingenieria.alumnos a
    WHERE a.desc_programa LIKE :programa
    GROUP BY UPPER(COALESCE(a.genero,'N/D')), UPPER(COALESCE(a.estatus,'N/D'))
    ORDER BY genero, estatus
    """
    return db.q(sql, programa=f"%{programa_like}%")
