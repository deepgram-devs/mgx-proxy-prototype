/**
 * Configuration for the WebSocket proxy
 */
module.exports = {
  // Server settings
  server: {
    port: process.env.PORT || 8080,
    targetUrl: process.env.TARGET_URL || 'ws://localhost:9000'
  },
  
  // Logging settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    prettyPrint: process.env.PRETTY_LOGS !== 'false'
  },
  
  // Replacement config for intercepted Config messages
  replacementSettings: {
    type: "Settings",
    audio: {
      input: {
        encoding: "linear16",
        sample_rate: 24000
      },
      output: {
        encoding: "linear16",
        sample_rate: 24000,
      }
    },
    agent: {
      language: "en",
      listen: {
        provider: {
          type: "deepgram",
          model: "nova-3"
        }
      },
      think: {
        provider: {
          type: "open_ai",
          model: "gpt-4o-mini",
          temperature: 0.7,
        },
      },
      speak: {
        provider: {
          type: "deepgram",
          model: "aura-2-thalia-en",
        },
      }
    }
  }
}; 