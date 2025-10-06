from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from .db import DB
from .routers import stats

app = FastAPI(title="CACEI MultiDB Stats API", version="0.1.0")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # ← lista explícita
    allow_credentials=True,         # ok si el origen está en la lista
    allow_methods=["*"],
    allow_headers=["*"],
)

db = DB()  # initialize engine

app.include_router(stats.router, prefix="/api")
