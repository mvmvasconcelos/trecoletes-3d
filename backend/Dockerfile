FROM python:3.11-slim

# Install OpenSCAD + libspatialindex (required by rtree for trimesh ray casting)
RUN apt-get update && \
    apt-get install -y openscad libgl1 libglu1-mesa fonts-liberation libspatialindex-dev potrace librsvg2-bin git ca-certificates curl libgpg-error0 && \
    git init /usr/share/openscad/libraries/BOSL2 && \
    git -C /usr/share/openscad/libraries/BOSL2 fetch --depth 1 \
      https://github.com/BelfrySCAD/BOSL2.git afe82db884ee4409aa76ecfcfbbf54d446964af1 && \
    git -C /usr/share/openscad/libraries/BOSL2 checkout FETCH_HEAD && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# OpenSCAD nightly snapshot (pinned by date, lives alongside the stable apt
# package). --appimage-extract unpacks without needing FUSE in the container.
# Bump OPENSCAD_NIGHTLY_DATE/SHA256 together when refreshing the snapshot.
ARG OPENSCAD_NIGHTLY_DATE=2026.07.26
ARG OPENSCAD_NIGHTLY_SHA256=570a39a199b443c2072312db458a405e18efe51d4c83756e76048ea1069d946c
RUN curl -fsSL -o /tmp/openscad-nightly.AppImage \
      "https://files.openscad.org/snapshots/OpenSCAD-${OPENSCAD_NIGHTLY_DATE}-x86_64.AppImage" && \
    echo "${OPENSCAD_NIGHTLY_SHA256}  /tmp/openscad-nightly.AppImage" | sha256sum -c - && \
    chmod +x /tmp/openscad-nightly.AppImage && \
    cd /tmp && ./openscad-nightly.AppImage --appimage-extract && \
    mv squashfs-root /opt/openscad-nightly && \
    ln -s /opt/openscad-nightly/AppRun /usr/local/bin/openscad-nightly && \
    rm /tmp/openscad-nightly.AppImage

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Ensure static directories exist
RUN mkdir -p static/generated static/uploads/svg static/fonts

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
