from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.api.generator import router as generator_router

app = FastAPI(title="Trecoletes 3D API")

# Setup CORS for local React development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
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
