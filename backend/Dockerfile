FROM python:3.11-slim

# Install OpenSCAD + libspatialindex (required by rtree for trimesh ray casting)
RUN apt-get update && \
    apt-get install -y openscad libgl1 libglu1-mesa fonts-liberation libspatialindex-dev potrace && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure static directories exist
RUN mkdir -p static/generated static/uploads/svg static/fonts

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
