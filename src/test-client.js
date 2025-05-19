const WebSocket = require('ws');
const readline = require('readline');

// Configuration
const CONFIG = {
  serverUrl: process.env.SERVER_URL || 'ws://localhost:8080'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ensure API key exists
if (!process.env.DEEPGRAM_API_KEY) {
  console.error('Error: DEEPGRAM_API_KEY environment variable is required');
  process.exit(1);
}

// Determine authentication method (default to subprotocol)
const useAuthHeader = process.env.USE_AUTH_HEADER === 'true';

console.log(`Connecting to ${CONFIG.serverUrl} with API key via ${useAuthHeader ? 'Authorization header' : 'subprotocol'}...`);

// Connection options
let options = {};
let protocols = undefined;

if (useAuthHeader) {
  // Use Authorization header
  options = {
    headers: {
      'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`
    }
  };
} else {
  // Use subprotocol
  protocols = ['token', process.env.DEEPGRAM_API_KEY];
}

// Connect with appropriate authentication method
const ws = new WebSocket(CONFIG.serverUrl, protocols, options);

// Connection event handlers
ws.on('open', () => {
  console.log('Connected to server');
  console.log('Available commands:');
  console.log('  config - Send a Config message');
  console.log('  text:<message> - Send a text message');
  console.log('  binary:<message> - Send a binary message');
  console.log('  exit - Close connection and exit');
  
  promptUser();
});

ws.on('message', (data) => {
  try {
    // Try to parse as JSON
    const message = JSON.parse(data);
    console.log('Received message:', JSON.stringify(message, null, 2));
  } catch (error) {
    // If not valid JSON, display as string or binary
    if (data instanceof Buffer) {
      console.log(`Received binary data: ${data.length} bytes`);
    } else {
      console.log(`Received message: ${data}`);
    }
  }
  
  promptUser();
});

ws.on('close', (code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`);
  rl.close();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
  rl.close();
  process.exit(1);
});

// Prompt for user input
function promptUser() {
  rl.question('> ', (input) => {
    if (input === 'exit') {
      console.log('Closing connection...');
      ws.close();
      return;
    }
    
    if (input === 'config') {
      console.log('Sending Config message');
      ws.send(JSON.stringify({ type: 'Config' }));
      return;
    }
    
    if (input.startsWith('text:')) {
      const message = input.substring(5);
      console.log(`Sending text message: ${message}`);
      ws.send(message);
      return;
    }
    
    if (input.startsWith('binary:')) {
      const message = input.substring(7);
      console.log(`Sending binary message: ${message}`);
      ws.send(Buffer.from(message));
      return;
    }
    
    console.log('Unknown command. Available commands:');
    console.log('  config - Send a Config message');
    console.log('  text:<message> - Send a text message');
    console.log('  binary:<message> - Send a binary message');
    console.log('  exit - Close connection and exit');
    
    promptUser();
  });
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nClosing connection...');
  ws.close();
  rl.close();
  process.exit(0);
}); 