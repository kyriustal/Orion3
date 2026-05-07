"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Orion 2 Backend is running successfully!' });
});
// API Routes
const auth_routes_1 = __importDefault(require("./api/auth.routes"));
const knowledge_routes_1 = __importDefault(require("./api/knowledge.routes"));
const whatsapp_routes_1 = __importDefault(require("./api/whatsapp.routes"));
const chat_routes_1 = __importDefault(require("./api/chat.routes"));
const core_routes_1 = __importDefault(require("./api/core.routes"));
app.use('/api/auth', auth_routes_1.default);
app.use('/api/knowledge', knowledge_routes_1.default);
app.use('/api/whatsapp', whatsapp_routes_1.default);
app.use('/api/orion-web', chat_routes_1.default);
app.use('/api', core_routes_1.default); // General CRUD
// Serve static frontend in production
const frontendPath = path_1.default.join(__dirname, '..', 'dist');
app.use(express_1.default.static(frontendPath));
// Fallback to React Router for all other requests
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(frontendPath, 'index.html'));
});
// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});
// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
