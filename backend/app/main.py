from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api.generator import router as generator_router

app = FastAPI(title="Trecoletes 3D API")

# Setup CORS for frontend development.
# Wildcard + credentials is rejected by browsers, so we keep explicit origins.
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
allowed_origins = (
    [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
    if allowed_origins_env
    else [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup static files directory
os.makedirs("static/generated", exist_ok=True)
os.makedirs("static/uploads/svg", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(generator_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to Trecoletes 3D API Backend"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
