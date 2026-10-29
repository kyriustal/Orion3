"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIo = getIo;
/**
 * Socket.io Singleton
 * Permite importar o `io` em qualquer rota sem dependência circular com server.ts
 */
const socket_io_1 = require("socket.io");
let io;
function initSocket(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
        transports: ['websocket', 'polling'],
    });
    io.on('connection', (socket) => {
        console.log(`[SOCKET] Cliente conectado: ${socket.id}`);
        // Entrar numa sala por org (para receber apenas as próprias mensagens)
        socket.on('join_org', (orgId) => {
            socket.join(`org:${orgId}`);
            console.log(`[SOCKET] Socket ${socket.id} entrou na sala org:${orgId}`);
        });
        socket.on('disconnect', () => {
            console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);
        });
    });
    return io;
}
function getIo() {
    if (!io)
        throw new Error('[SOCKET] Socket.io não foi inicializado. Chame initSocket() primeiro.');
    return io;
}
