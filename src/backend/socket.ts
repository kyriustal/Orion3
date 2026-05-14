/**
 * Socket.io Singleton
 * Permite importar o `io` em qualquer rota sem dependência circular com server.ts
 */
import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Cliente conectado: ${socket.id}`);

    // Entrar numa sala por org (para receber apenas as próprias mensagens)
    socket.on('join_org', (orgId: string) => {
      socket.join(`org:${orgId}`);
      console.log(`[SOCKET] Socket ${socket.id} entrou na sala org:${orgId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('[SOCKET] Socket.io não foi inicializado. Chame initSocket() primeiro.');
  return io;
}
