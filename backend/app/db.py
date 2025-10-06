import os
from sqlalchemy import create_engine, text

class DB:
    def __init__(self):
        host = os.getenv("DB_HOST","localhost")
        port = int(os.getenv("DB_PORT","13306"))
        user = os.getenv("DB_USER","root")
        pw   = os.getenv("DB_PASS","rootpass")
        # We won't bind to a single schema; we will reference schema.table in queries
        uri = f"mysql+pymysql://{user}:{pw}@{host}:{port}/"
        self.engine = create_engine(uri, pool_pre_ping=True, pool_recycle=3600)

    def q(self, sql: str, **params):
        with self.engine.connect() as conn:
            res = conn.execute(text(sql), params)
            cols = res.keys()
            data = [dict(zip(cols, row)) for row in res.fetchall()]
        return data
