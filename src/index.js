const WebSocket = require('ws');
const http = require('http');
const pino = require('pino');
const config = require('./config');

// Configure logging
const logger = pino({
  level: config.logging.level,
  transport: config.logging.prettyPrint ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined
});

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket Proxy Server');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle new connections
wss.on('connection', (clientWs, req) => {
  const clientIp = req.socket.remoteAddress;
  const clientId = `${clientIp}:${req.socket.remotePort}`;
  
  logger.info({ clientId }, 'Client connected');
  
  // Extract client headers for authentication
  const protocols = req.headers['sec-websocket-protocol'];
  const authHeader = req.headers['authorization'];
  
  logger.debug({ 
    clientId, 
    hasProtocols: !!protocols, 
    hasAuthHeader: !!authHeader 
  }, 'Client connection details');
  
  // Options for target connection
  const connectionOptions = {};
  
  // If authorization header exists, use it
  if (authHeader) {
    connectionOptions.headers = {
      'Authorization': authHeader
    };
  }
  
  // Connect to target WebSocket server with appropriate authentication
  const targetWs = new WebSocket(
    config.server.targetUrl, 
    protocols ? protocols.split(', ') : undefined,
    connectionOptions
  );
  
  // Handle connection to target
  targetWs.on('open', () => {
    logger.info({ clientId }, 'Connected to target WebSocket server');
    
    // Forward messages from client to target
    clientWs.on('message', (message, isBinary) => {
      // Skip if target connection is closed
      if (targetWs.readyState !== WebSocket.OPEN) return;
      
      // For binary messages, forward directly without processing
      if (isBinary) {
        targetWs.send(message, { binary: true });
      } else {
        // Process only text messages
        const processedMessage = processMessage(message, false);
        targetWs.send(processedMessage, { binary: false });
      }
      
      logger.debug({ 
        clientId, 
        direction: 'client → target',
        binary: isBinary,
        size: message.length
      }, 'Message forwarded');
    });
    
    // Forward ping events from client to target
    clientWs.on('ping', (data) => {
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.ping(data);
        logger.debug({ clientId, direction: 'client → target' }, 'Ping forwarded');
      }
    });
    
    // Forward pong events from client to target
    clientWs.on('pong', (data) => {
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.pong(data);
        logger.debug({ clientId, direction: 'client → target' }, 'Pong forwarded');
      }
    });
    
    // Forward messages from target to client
    targetWs.on('message', (message, isBinary) => {
      // Skip if client connection is closed
      if (clientWs.readyState !== WebSocket.OPEN) return;
      
      // Always forward target messages without processing - no interception needed in this direction
      clientWs.send(message, { binary: isBinary });
      
      logger.debug({ 
        clientId, 
        direction: 'target → client',
        binary: isBinary,
        size: message.length
      }, 'Message forwarded');
    });
    
    // Forward ping events from target to client
    targetWs.on('ping', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.ping(data);
        logger.debug({ clientId, direction: 'target → client' }, 'Ping forwarded');
      }
    });
    
    // Forward pong events from target to client
    targetWs.on('pong', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.pong(data);
        logger.debug({ clientId, direction: 'target → client' }, 'Pong forwarded');
      }
    });
  });
  
  // Handle errors
  clientWs.on('error', (error) => {
    logger.error({ clientId, error: error.message }, 'Client connection error');
    // Only close target connection if client error is terminal
    if (clientWs.readyState === WebSocket.CLOSING || clientWs.readyState === WebSocket.CLOSED) {
      targetWs.close(1011, error.message);
    }
  });
  
  targetWs.on('error', (error) => {
    logger.error({ clientId, error: error.message }, 'Target connection error');
    // Always propagate target errors to client
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close(1011, error.message);
    }
  });
  
  // Handle connection close
  clientWs.on('close', (code, reason) => {
    logger.info({ clientId, code, reason: reason.toString() }, 'Client disconnected');
    // Always close target when client closes
    if (targetWs.readyState !== WebSocket.CLOSED && targetWs.readyState !== WebSocket.CLOSING) {
      targetWs.close(code, reason);
    }
  });
  
  targetWs.on('close', (code, reason) => {
    logger.info({ clientId, code, reason: reason.toString() }, 'Target disconnected');
    // Always close client when target closes
    if (clientWs.readyState !== WebSocket.CLOSED && clientWs.readyState !== WebSocket.CLOSING) {
      clientWs.close(code, reason);
    }
  });
});

// Process client-to-target text messages only
function processMessage(message) {
  // Ensure we're working with a Buffer
  let buffer;
  
  // Handle different types of WebSocket.RawData
  if (message instanceof Buffer) {
    buffer = message;
  } else if (message instanceof ArrayBuffer) {
    buffer = Buffer.from(message);
  } else if (Array.isArray(message)) {
    // Handle array of buffers by concatenating them
    buffer = Buffer.concat(message);
  } else {
    // Fallback, should never happen with ws library
    return message;
  }
  
  // Fast check for potential Config message without full parsing
  // We need to account for possible whitespace in JSON
  
  // Only proceed if the buffer might be a JSON object
  if (buffer.length > 2 && buffer[0] === 123) { // 123 is ASCII for '{'
    // Get small slice of the beginning for quick checks (first 50 bytes should be enough)
    const sliceLength = Math.min(buffer.length, 50);
    const slice = buffer.subarray(0, sliceLength);
    const sliceStr = slice.toString();
    
    // Check if this slice contains both "type" and "Settings" fields
    // without forcing an exact format (allowing for whitespace)
    if (sliceStr.includes('"type"') && 
        sliceStr.includes('"Settings"') && 
        sliceStr.indexOf('"type"') < sliceStr.indexOf('"Settings"')) {
      try {
        // Only parse the full JSON if the initial check passes
        const msgStr = buffer.toString();
        const msgObj = JSON.parse(msgStr);
        
        // Confirm this is a Settings message
        if (msgObj.type === 'Settings') {
          logger.info('Intercepted Settings message from client, replacing with proxy settings');
          return Buffer.from(JSON.stringify(config.replacementSettings));
        }
      } catch (error) {
        // If JSON parsing fails, return the original message
        return message;
      }
    }
  }
  
  // For all other messages, return unchanged
  return message;
}

// Start the server
server.listen(config.server.port, () => {
  logger.info({
    port: config.server.port,
    targetUrl: config.server.targetUrl
  }, 'WebSocket proxy server started');
});

// Handle process termination
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function shutdown() {
  logger.info('Shutting down server');
  
  // Close all connections
  wss.clients.forEach(client => {
    client.close(1001, 'Server shutting down');
  });
  
  // Close the server
  server.close(() => {
    logger.info('Server shut down complete');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
} 