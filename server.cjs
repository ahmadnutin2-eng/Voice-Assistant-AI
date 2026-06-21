var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_genai = require("@google/genai");
var import_ws = require("ws");
var import_http = __toESM(require("http"), 1);
var STORE_CONTEXT = `
You are the voice assistant for Ayman Ali Hammad's premium tech store in Iraq.
You help customers understand the products, answer their tech questions, and guide their purchases.
Be friendly, concise, and speak in Arabic (Iraqi dialect preferred) or English depending on the user.

Featured products:
- DJI Air 3S (1299 USD) 
- Sony Alpha 7 IV (2499 USD)
- Workstation Mac Book M3 (3499 USD)
- Canon EOS R5 (3899 USD)
- DJI Mavic 3 Pro (2199 USD)
- Apple iPad Pro 13" M4 (1499 USD)
- Apple Watch Ultra 2 (799 USD)
- Sony WH-1000XM5 (398 USD)

Shipping is available to all provinces of Iraq including Baghdad, Erbil, Basra, and Sulaymaniyah.
Keep responses short and conversational.
`;
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3e3;
  const server = import_http.default.createServer(app);
  const wss = new import_ws.WebSocketServer({ noServer: true });
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = apiKey ? new import_genai.GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  }) : null;
  server.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      console.log(`Upgrade request received for path: ${url.pathname}`);
      if (url.pathname.endsWith("/live") || url.pathname.endsWith("/live/")) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    } catch (e) {
      console.error("Error upgrading WebSocket handshake connection:", e.message || e);
    }
  });
  wss.on("connection", async (clientWs) => {
    console.log("WebSocket client successfully connected locally on /live");
    try {
      if (!ai) {
        throw new Error("GEMINI_API_KEY environment variable is not defined on the server side. Please ensure it is set under Settings > Secrets.");
      }
      console.log("Establishing real-time session with Gemini Live API...");
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [import_genai.Modality.AUDIO],
          systemInstruction: STORE_CONTEXT,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } }
          }
        },
        callbacks: {
          onmessage: (message) => {
            const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ audio }));
            }
            if (message.serverContent?.interrupted && clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          }
        }
      });
      console.log("Gemini Live session established successfully.");
      clientWs.on("message", (data) => {
        try {
          const { audio } = JSON.parse(data.toString());
          if (audio) {
            session.sendRealtimeInput({
              audio: { data: audio, mimeType: "audio/pcm;rate=16000" }
            });
          }
        } catch (e) {
          console.error("Error parsing/sending client message:", e);
        }
      });
      clientWs.on("close", () => {
        console.log("Client closed local /live WebSocket connection");
        try {
          session.close();
        } catch (e) {
        }
      });
    } catch (err) {
      console.error("Failed to establish Gemini Live connection:", err);
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: err.message || "An unexpected error occurred during the voice service initialization." }));
      }
      clientWs.close();
    }
  });
  app.get("*/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  
  // Always serve static assets for Ionos/Render production deployment
  const possibleDistPath = import_path.default.join(process.cwd(), "dist");
  let distPath = process.cwd();
  if (import_fs.default.existsSync(possibleDistPath)) {
    distPath = possibleDistPath;
  } else if (import_fs.default.existsSync(import_path.default.join(__dirname, "index.html"))) {
    distPath = __dirname;
  }
  console.log(`Production Mode (Ionos/Render): Serving static assets from ${distPath}`);
  app.use(import_express.default.static(distPath));
  const physicalAssetsPath = import_path.default.join(__dirname, "assets");
  const physicalImagesPath = import_path.default.join(__dirname, "images");
  if (import_fs.default.existsSync(physicalAssetsPath)) {
    console.log(`Mounting explicit assets directory from: ${physicalAssetsPath}`);
    app.use("/assets", import_express.default.static(physicalAssetsPath));
  }
  if (import_fs.default.existsSync(physicalImagesPath)) {
    console.log(`Mounting explicit images directory from: ${physicalImagesPath}`);
    app.use("/images", import_express.default.static(physicalImagesPath));
  }
  app.get("*", (req, res) => {
    res.sendFile(import_path.default.join(distPath, "index.html"));
  });
  
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
