"""
Modal deployment for Oregon Kicker Refund Calculator.

Deploy with: modal deploy modal_app.py
"""

import modal

app = modal.App("oregon-kicker-refund")

# Build the Next.js app using Modal's image builder
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "ca-certificates")
    # Install Node.js 20
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    # Copy frontend source and build (copy=True allows running commands after)
    .add_local_dir("frontend", "/app", copy=True)
    .workdir("/app")
    .env({"NEXT_PUBLIC_BASE_PATH": ""})
    .run_commands(
        "npm ci",
        "npm run build",
    )
)


@app.function(
    image=image,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(port=3000, startup_timeout=60)
def web():
    """Serve the Next.js app."""
    import subprocess
    subprocess.Popen(["node", "/app/.next/standalone/server.js"])
