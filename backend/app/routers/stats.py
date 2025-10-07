from fastapi import APIRouter, Query
from ..db import DB

router = APIRouter()
db = DB()

# --- AUX: introspección de esquema / catálogo de materias --------------------
def _table_exists(schema: str, table: str) -> bool:
    rows = db.q("""
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = :s AND table_name = :t
        LIMIT 1
    """, s=schema, t=table)
    return bool(rows)

def _col_exists(schema: str, table: str, column: str) -> bool:
    rows = db.q("""
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = :s AND table_name = :t AND column_name = :c
        LIMIT 1
    """, s=schema, t=table, c=column)
    return bool(rows)

def _materia_join_for(alias: str = "d") -> tuple[str, str]:
    """
    Devuelve (join_sql, expr_nombre) para obtener el nombre de la materia.
    Prioriza 'ingenieria.materias' y luego 'estadistica.materias'.
    Si no existe catálogo, regresa ('', 'NULL').
    """
    # 1) ingenieria.materias (clave, nombre|asignatura)
    if _table_exists("ingenieria", "materias") and _col_exists("ingenieria", "materias", "clave"):
        if _col_exists("ingenieria", "materias", "nombre"):
            return (f"LEFT JOIN ingenieria.materias m ON m.clave = {alias}.clave", "m.nombre")
        if _col_exists("ingenieria", "materias", "asignatura"):
            return (f"LEFT JOIN ingenieria.materias m ON m.clave = {alias}.clave", "m.asignatura")

    # 2) estadistica.materias (clave, nombre)
    if _table_exists("estadistica", "materias") and _col_exists("estadistica", "materias", "clave"):
        if _col_exists("estadistica", "materias", "nombre"):
            return (f"LEFT JOIN estadistica.materias m ON m.clave = {alias}.clave", "m.nombre")

    # 3) sin catálogo disponible
    return ("", "NULL")

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
    aprobatoria: float = 6.0,
    contar_no_numericas: bool = False,  # si TRUE, NP/NA cuentan como reprobadas
):
    """
    Índice de reprobación por ciclo usando la MEJOR calificación por (matrícula, clave, ciclo).
    Normaliza 'aprobatoria' a la escala detectada:
      - max<=1.0  -> si aprobatoria>1 => /100; si <=1 => tal cual
      - max<=10.0 -> si aprobatoria>10 => /10; si <=10 => tal cual
      - max>10.0  -> aprobatoria tal cual
    """
    sql = r"""
    WITH base AS (
      SELECT
        b.matricula,
        b.clave,
        b.ciclo,
        TRIM(b.calificacion) AS calif_txt,
        CASE WHEN b.calificacion REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(b.calificacion AS DECIMAL(10,2))
             ELSE NULL END AS calif_num
      FROM estadistica.boletas b
      LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
      WHERE UPPER(COALESCE(b.carrera, a.desc_programa, '')) LIKE :programa
    ),
    escala AS (
      SELECT COALESCE(MAX(calif_num), 0) AS max_val FROM base
    ),
    params AS (
      SELECT CASE
               WHEN max_val <= 1.0 THEN CASE WHEN :aprobatoria > 1.0 THEN :aprobatoria/100.0 ELSE :aprobatoria END
               WHEN max_val <= 10.0 THEN CASE WHEN :aprobatoria > 10.0 THEN :aprobatoria/10.0 ELSE :aprobatoria END
               ELSE :aprobatoria
             END AS aprob_calc
      FROM escala
    ),
    final_alumno_materia AS (  -- mejor intento por alumno-materia-ciclo
      SELECT
        matricula, clave, ciclo,
        MAX(calif_num) AS calif_final
      FROM base
      GROUP BY matricula, clave, ciclo
    )
    SELECT
      f.ciclo AS ciclo,
      SUM(CASE WHEN f.calif_final IS NOT NULL THEN 1 ELSE 0 END) AS evaluadas,
      SUM(CASE
            WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1
            WHEN f.calif_final IS NULL AND :inc_non_num = 1 THEN 1
            ELSE 0
          END) AS reprobados,
      ROUND(
        100.0 * SUM(CASE
                      WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1
                      WHEN f.calif_final IS NULL AND :inc_non_num = 1 THEN 1
                      ELSE 0
                    END)
        / NULLIF(SUM(CASE WHEN f.calif_final IS NOT NULL THEN 1 ELSE 0 END), 0), 2
      ) AS porcentaje_reprobacion,
      (SELECT aprob_calc FROM params) AS umbral_usado
    FROM final_alumno_materia f
    GROUP BY f.ciclo
    ORDER BY f.ciclo;
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

@router.get("/reprobacion_detalle")
def reprobacion_detalle(
    programa_like: str = "AEROESPACIAL",
    aprobatoria: float = 6.0,
    ciclo: str | None = None,   # p.ej. "2022-SEM-AGO/DIC"
):
    """
    Detalle por materia dentro de cada ciclo, usando la MEJOR calificación por (matrícula, clave, ciclo).
    Devuelve: Clave, Nombre de la Materia, Ciclo, Semestre (num), No. Alumnos, No. Reprobados, Porcentaje, umbral_usado.
    """
    sql = r"""
    WITH base AS (
      SELECT
        b.matricula,
        b.clave,
        b.ciclo,
        TRIM(b.grado) AS grado_txt,
        CASE WHEN b.calificacion REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(b.calificacion AS DECIMAL(10,2))
             ELSE NULL END AS calif_num
      FROM estadistica.boletas b
      LEFT JOIN ingenieria.alumnos a ON a.matricula = b.matricula
      WHERE UPPER(COALESCE(b.carrera, a.desc_programa, '')) LIKE :programa
        AND (:ciclo IS NULL OR b.ciclo = :ciclo)
    ),
    escala AS (
      SELECT COALESCE(MAX(calif_num), 0) AS max_val FROM base
    ),
    params AS (
      SELECT CASE
               WHEN max_val <= 1.0 THEN CASE WHEN :aprobatoria > 1.0 THEN :aprobatoria/100.0 ELSE :aprobatoria END
               WHEN max_val <= 10.0 THEN CASE WHEN :aprobatoria > 10.0 THEN :aprobatoria/10.0 ELSE :aprobatoria END
               ELSE :aprobatoria
             END AS aprob_calc
      FROM escala
    ),
    base_con_sem AS (
      SELECT
        matricula, clave, ciclo,
        CASE
          WHEN grado_txt REGEXP '^[0-9]+' THEN CAST(REGEXP_SUBSTR(grado_txt, '^[0-9]+') AS UNSIGNED)
          ELSE 0
        END AS semestre_n,
        calif_num
      FROM base
    ),
    final_alumno_materia AS (  -- mejor intento por alumno-materia-ciclo
      SELECT
        matricula, clave, ciclo,
        MIN(semestre_n) AS semestre,      -- por si hay variaciones, tomamos el menor (suele ser constante)
        MAX(calif_num)  AS calif_final
      FROM base_con_sem
      GROUP BY matricula, clave, ciclo
    )
    SELECT
      f.clave                                        AS `Clave`,
      COALESCE(m.materia, '(SIN NOMBRE)')            AS `Nombre de la Materia`,
      f.ciclo                                        AS `Ciclo`,
      f.semestre                                     AS `Semestre`,
      COUNT(*)                                       AS `No. Alumnos`,
      SUM(CASE WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1 ELSE 0 END)
                                                   AS `No. Reprobados`,
      ROUND(
        100.0 * SUM(CASE WHEN f.calif_final IS NOT NULL AND f.calif_final < (SELECT aprob_calc FROM params) THEN 1 ELSE 0 END)
        / NULLIF(COUNT(*), 0), 1
      )                                              AS `Porcentaje`,
      (SELECT aprob_calc FROM params)                AS `umbral_usado`
    FROM final_alumno_materia f
    LEFT JOIN ingenieria.materias m ON m.clave = f.clave
    GROUP BY f.clave, `Nombre de la Materia`, f.ciclo, f.semestre
    ORDER BY f.ciclo, f.semestre, f.clave;
    """
    return db.q(
        sql,
        programa=f"%{programa_like.upper()}%",
        aprobatoria=aprobatoria,
        ciclo=ciclo,
    )
