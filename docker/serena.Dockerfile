# Custom Serena image with Rust toolchain for rust-analyzer
FROM ghcr.io/oraios/serena:latest

# Install Rust toolchain and development dependencies
USER root
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        build-essential \
        ca-certificates \
        pkg-config \
        libssl-dev \
        clang \
        llvm \
        protobuf-compiler \
        git && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Setup Rust environment
ENV PATH="/root/.cargo/bin:${PATH}"
ENV CARGO_HOME="/root/.cargo"
ENV RUSTUP_HOME="/root/.rustup"

# Install rust-analyzer and additional components
RUN rustup component add rust-analyzer rust-src rustfmt clippy && \
    rustup target add wasm32-unknown-unknown

# Pre-install common Polkadot SDK dependencies for faster builds
RUN cargo install --locked cargo-expand cargo-watch cargo-edit

# Configure rust-analyzer for Polkadot SDK projects
RUN mkdir -p /root/.config/rust-analyzer && \
    echo '{ \
        "cargo": { \
            "features": ["runtime-benchmarks"], \
            "allTargets": false \
        }, \
        "checkOnSave": { \
            "command": "clippy", \
            "extraArgs": ["--", "-W", "clippy::all"] \
        }, \
        "procMacro": { \
            "enable": true, \
            "attributes": { \
                "enable": true \
            } \
        } \
    }' > /root/.config/rust-analyzer/config.json

# Optimize for Polkadot SDK projects
ENV RUST_BACKTRACE=1
ENV CARGO_INCREMENTAL=1
ENV RUSTFLAGS="-C link-arg=-fuse-ld=lld"

# Stay as root since the base image runs as root
# The CMD is inherited from the base image