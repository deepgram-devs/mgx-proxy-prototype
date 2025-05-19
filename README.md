# WebSocket Proxy

A lightweight, stateless WebSocket proxy designed for high-performance enterprise applications.

## Requirements

- Node.js 18 or higher

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd mgx-proxy-prototype

# Install dependencies
npm install
```

## Configuration

The proxy can be configured using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | The port the proxy server will listen on | 8080 |
| TARGET_URL | The WebSocket server to proxy to | ws://localhost:9000 |
| LOG_LEVEL | Logging level (debug, info, warn, error) | info |

## Usage

### Starting the Server

```bash
# Start with default settings
npm start

# Start with custom environment variables
PORT=9090 TARGET_URL=ws://example.com/ws npm start

# Start in development mode (with auto-restart)
npm run dev
```

### Using with Docker

```bash
# Build the Docker image
docker build -t mgx-proxy .

# Run the container
docker run -p 8080:8080 -e TARGET_URL=ws://target-server/ws mgx-proxy
```
