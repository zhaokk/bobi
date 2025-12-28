/**
 * WebSocket Server for Bobi
 * Handles client connections from WebUI
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { logger } from '../utils/logger.js';
import { orchestrator } from '../orchestrator/index.js';
import type { ServerMessage } from '../types/index.js';

interface Client {
  id: string;
  ws: WebSocket;
  connectedAt: number;
}

class BobiWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Client> = new Map();
  private clientIdCounter = 0;

  /**
   * Start WebSocket server
   * @param serverOrPort - Either an HTTP server instance or a port number
   */
  start(serverOrPort: HttpServer | number): void {
    if (typeof serverOrPort === 'number') {
      // Standalone mode with port
      this.wss = new WebSocketServer({ port: serverOrPort });
      logger.info('WebSocket', `Server started on ws://localhost:${serverOrPort}`);
    } else {
      // Attached to HTTP server
      this.wss = new WebSocketServer({ server: serverOrPort });
      logger.info('WebSocket', 'Server attached to HTTP server');
    }

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = `client_${++this.clientIdCounter}`;
      const client: Client = {
        id: clientId,
        ws,
        connectedAt: Date.now(),
      };

      this.clients.set(clientId, client);
      logger.info('WebSocket', `Client connected: ${clientId}`);

      // Send initial status
      const status = orchestrator.getStatus();
      this.send(ws, {
        type: 'state_change',
        payload: status,
        ts: Date.now(),
      });

      // Handle messages
      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          await orchestrator.handleClientMessage(message);
        } catch (err) {
          logger.error('WebSocket', 'Failed to handle message', err);
        }
      });

      // Handle close
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info('WebSocket', `Client disconnected: ${clientId}`);
      });

      // Handle errors
      ws.on('error', (err) => {
        logger.error('WebSocket', `Client error: ${clientId}`, err);
      });
    });

    // Subscribe to orchestrator broadcasts
    orchestrator.on('broadcast', (message: ServerMessage) => {
      this.broadcast(message);
    });
  }

  stop(): void {
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
    logger.info('WebSocket', 'Server stopped');
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton instance
export const wsServer = new BobiWebSocketServer();
