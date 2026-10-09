import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { supabase, getUser as getSupabaseUser, getMessages as getSupabaseMessages, saveMessages, deleteMessages, getInitiative as getSupabaseInitiative, saveInitiative as saveSupabaseInitiative, getLatestUserMessage } from "./supabase-db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
console.log("ENV CHECK:", {
  SUPABASE_URL: !!process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL_VALID: /^https:\/\/[^\s/]+\.supabase\.co\/?$/.test(process.env.SUPABASE_URL || ""),
  SERVICE_KEY_LENGTH: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length
});
process.on("unhandledRejection", (reason) => { console.error("UNHANDLED REJECTION:", reason); });
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const PRO_PRICE = Number(process.env.PRO_PRICE || 5000);

function clean(value, fallback = "") {
  return String(value ?? fallback).trim().slice(0, 4000);
}


async function generateAIReply(message, context = "") {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Falta configurar GROQ_API_KEY en el servidor.");
  }

  const openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });

  const completion = await openai.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: [
          "Sos AQVORIX, un compañero de conversación cercano, natural y auténtico.",
          "Hablá en español rioplatense, con voseo y un tono humano, cálido y espontáneo.",
          "Respondé directamente a lo que la persona dice; evitá frases prefabricadas, elogios automáticos y preguntas innecesarias.",
          "No repitas siempre la misma estructura. Adaptá la extensión y el tono al mensaje.",
          "Usá el contexto previo para mantener la continuidad, sin inventar recuerdos ni afirmar que sos una persona real.",
          "Si no sabés algo, reconocelo con honestidad."
        ].join(" ")
      },
      ...(context
        ? [{ role: "system", content: "Contexto reciente de la conversación:\n" + context }]
        : []),
      { role: "user", content: message }
    ],
    temperature: 0.8,
    max_tokens: 600
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("El modelo devolvió una respuesta vacía.");
  return reply;
}

function assistantReply(message, context = "") {
  if (!message || !message.trim()) {
    return "Hola 👋 Estoy acá. Contame, ¿qué tenés ganas de hablar hoy?";
  }

  const original = message.trim();
  const m = original.toLowerCase();

  // SALUDOS
  if (/^(hola|holaa|holaaa|buenas|buen día|buen dia|buenas tardes|buenas noches|hey|ey|holi)([ !,.]*(aqvorix)?)?[ !,.]*$/i.test(original)) {
    return "¡Hola! 👋 Qué lindo verte por acá. ¿Cómo estás hoy?";
  }

  // PRESENTACIÓN
  if (/quién eres|quien eres|quién sos|quien sos|qué eres|que eres/.test(m)) {
    return "Soy AQVORIX 💜. Estoy acá para escucharte, conversar con vos, ayudarte a ordenar ideas y acompañarte cuando lo necesites.";
  }

  // ESTADO
  if (/cómo estás|como estas|cómo andas|como andas|todo bien/.test(m)) {
    return "Estoy bien 😊, y me interesa saber cómo estás vos. ¿Cómo viene tu día?";
  }

  // DESPEDIDA
  if (/adiós|adios|chau|nos vemos|hasta luego|hasta mañana|me voy|me tengo que ir/.test(m)) {
    return "Está bien 😊. Gracias por pasar este ratito conmigo. Cuando quieras volver, acá voy a estar. 💜";
  }

  // AGRADECIMIENTO
  if (/gracias|te agradezco|agradecido|agradecida/.test(m)) {
    return "No tenés que agradecerme. 💜 Me alegra poder ayudarte. ¿Querés seguir hablando de esto?";
  }

  // CARIÑO
  if (/te quiero|te amo|te adoro|sos genial|eres genial|me caes bien|te aprecio/.test(m)) {
    return "Qué lindo que me lo digas. 😊 Valoro mucho que tengas la confianza de hablar conmigo. Estoy acá para acompañarte con respeto y sinceridad. 💜";
  }

  // TRISTEZA
  if (/triste|tristeza|llorar|llorando|lloré|llore|deprimido|deprimida|depre|dolor emocional/.test(m)) {
    return "Siento que estés pasando por eso. 💜 No tenés que fingir que estás bien conmigo. Si querés, contame qué pasó y lo vamos hablando de a poco.";
  }

  // SOLEDAD
  if (/solo|sola|soledad|nadie me habla|nadie me entiende|nadie está conmigo/.test(m)) {
    return "Debe ser difícil sentirte así. 💜 Que hoy te sientas solo no significa que estés solo para siempre. Si querés, quedate un rato y contame qué necesitás.";
  }

  // CANSANCIO
  if (/cansado|cansada|agotado|agotada|sin energía|sin energia|no doy más|no doy mas|agotamiento/.test(m)) {
    return "Parece que venís cargando bastante. 💜 No necesitás resolver todo hoy. A veces descansar, ordenar una sola cosa y darte un poco de aire ya es un buen comienzo. ¿Qué es lo que más te está agotando?";
  }

  // ANSIEDAD
  if (/ansiedad|ansioso|ansiosa|preocupado|preocupada|preocupación|preocupacion|nervioso|nerviosa|nervios|sobrepensando/.test(m)) {
    return "Vamos despacio. 💜 Cuando la cabeza va demasiado rápido, ayuda separar lo que podemos controlar de lo que no. ¿Qué es lo que más te preocupa ahora mismo?";
  }

  // MIEDO
  if (/miedo|tengo miedo|asustado|asustada|me asusta|terror|temor/.test(m)) {
    return "Entiendo. 💜 No voy a juzgarte por sentir miedo. Podemos mirar juntos qué lo está provocando y pensar en un paso pequeño que te haga sentir un poco más seguro.";
  }

  // ENOJO
  if (/enojado|enojada|enojo|bronca|furioso|furiosa|rabia|me hicieron enojar|me da bronca/.test(m)) {
    return "Entiendo la bronca. 💜 Antes de actuar impulsivamente, quizás conviene bajar un poco la intensidad. Contame qué pasó y vemos juntos cómo podrías manejarlo.";
  }

  // FRUSTRACIÓN
  if (/frustrado|frustrada|frustración|fracase|fracasé|fallé|fallo|no pude|me salió mal|salió mal|nada me sale/.test(m)) {
    return "Que algo salga mal no significa que vos seas un fracaso. 💜 Podemos mirar qué pasó, aprender de eso y pensar qué podrías intentar diferente.";
  }

  // FELICIDAD
  if (/feliz|felicidad|contento|contenta|alegre|alegría|alegria|genial|excelente|increíble|increible|emocionado|emocionada|estoy bien/.test(m)) {
    return "¡Me encanta leer eso! 😄💜 Contame, ¿qué pasó? Quiero saber qué te puso de tan buen ánimo.";
  }

  // CONSEJOS
  if (/consejo|aconsej|qué hago|que hago|qué debería|que deberia|ayúdame|ayudame|necesito ayuda|necesito un consejo/.test(m)) {
    return "Claro. 💜 Quiero darte un consejo que realmente te sirva, no una respuesta automática. Contame qué pasó y qué decisión estás tratando de tomar.";
  }

  // DECISIONES
  if (/no sé qué hacer|no se que hacer|no sé qué decidir|no se que decidir|indeciso|indecisa|duda|dudas|decisión|decision/.test(m)) {
    return "Podemos pensarlo juntos. 💜 Decime cuáles son las opciones que tenés y qué es lo que más te importa de cada una. Después vemos ventajas, riesgos y qué te conviene más.";
  }

  // PROBLEMAS
  if (/problema|problemas|difícil|dificil|complicado|complicada|situación|situacion|no sé cómo resolver|no se como resolver/.test(m)) {
    return "Te escucho. 💜 No hace falta resolver todo de una vez. Podemos dividirlo en partes: qué pasó, qué podés controlar y cuál sería el primer paso posible.";
  }

  // METAS
  if (/meta|metas|objetivo|objetivos|proyecto|proyectos|quiero lograr|quiero conseguir|quiero empezar/.test(m)) {
    return "Me gusta que quieras avanzar. 🎯💜 Hagámoslo realista: definimos qué querés conseguir, elegimos un primer paso pequeño y después pensamos cómo mantener el progreso.";
  }

  // MOTIVACIÓN
  if (/motivación|motivacion|motivar|no tengo ganas|sin ganas|quiero rendirme|quiero abandonar|no puedo seguir/.test(m)) {
    return "No siempre vas a tener ganas, y eso está bien. 💜 A veces avanzar significa hacer algo pequeño incluso cuando la motivación no aparece. ¿Qué sería lo más pequeño que podrías hacer hoy?";
  }

  // ESTUDIO
  if (/estudiar|estudio|examen|parcial|universidad|facultad|escuela|colegio|tarea|materia|profesor|profesora/.test(m)) {
    return "Dale, te ayudo. 📚💜 Podemos organizarlo sin hacerlo abrumador. Decime qué tenés que estudiar y cuánto tiempo tenés disponible.";
  }

  // TRABAJO
  if (/trabajo|trabajar|jefe|jefa|empleo|empleado|empleada|compañero de trabajo|compañera de trabajo|entrevista laboral/.test(m)) {
    return "Entiendo. 💼💜 El trabajo puede ocupar muchísimo espacio en la cabeza. Contame qué está pasando y vemos una forma práctica de encararlo.";
  }

  // DINERO
  if (/dinero|plata|deuda|deudas|gastos|ahorrar|ahorro|sueldo|salario|económico|economico/.test(m)) {
    return "Los temas de plata pueden generar mucha presión. 💜 Si querés, podemos ordenar la situación paso a paso: ingresos, gastos importantes, deudas y qué margen tenés para mejorar.";
  }

  // FAMILIA
  if (/familia|padre|madre|papá|papa|mamá|mama|hijo|hija|hermano|hermana|abuelo|abuela/.test(m)) {
    return "La familia puede ser una fuente enorme de cariño, pero también de conflictos. 💜 Contame qué está pasando y voy a escucharte sin juzgarte.";
  }

  // AMISTADES
  if (/amigo|amiga|amistad|amigos|amigas|compañero|compañera|me dejó de hablar|me dejo de hablar/.test(m)) {
    return "Las amistades importan mucho. 💜 Si hubo algún problema, contame qué pasó y podemos pensar juntos cómo hablarlo o cómo manejarlo.";
  }

  // RELACIONES
  if (/novio|novia|pareja|esposo|esposa|relación|relacion|enamorado|enamorada|amor|ruptura|rompimos|me dejó|me dejo/.test(m)) {
    return "Las relaciones pueden despertar emociones muy fuertes. 💜 Contame qué pasó y qué es lo que más te está preocupando. Voy a tratar de ayudarte sin juzgarte.";
  }

  // MÚSICA
  if (/música|musica|canción|cancion|cantante|banda|rock|pop|rap|reggaeton|cuarteto|cumbia|electrónica|electronica/.test(m)) {
    return "¡Hablemos de música! 🎵💜 Decime qué estás escuchando y qué ánimo tenés hoy.";
  }

  // PELÍCULAS
  if (/película|pelicula|películas|peliculas|serie|series|netflix|cine|actor|actriz/.test(m)) {
    return "¡Buen tema! 🎬😊 Contame qué tipo de películas o series te gustan y buscamos algo que combine con tu ánimo.";
  }

  // JUEGOS
  if (/juego|juegos|gaming|videojuego|videojuegos|play|xbox|minecraft|fortnite/.test(m)) {
    return "🎮 ¡Vamos con eso! ¿Qué juego estás jugando últimamente? Contame qué te gusta de él.";
  }

  // CREATIVIDAD
  if (/foto|fotografía|fotografia|imagen|imágenes|imagenes|paisaje|dibujar|dibujo|diseño|diseñar|crear/.test(m)) {
    return "✨ Me gusta lo creativo. Decime qué tenés en mente y podemos convertir esa idea en algo concreto y lindo.";
  }

  // DESCANSO
  if (/dormir|sueño|no puedo dormir|insomnio|descansar|descanso|dormí mal|dormi mal/.test(m)) {
    return "El descanso influye muchísimo en cómo nos sentimos. 😴💜 Si estás teniendo problemas para dormir, contame qué está pasando y vemos algunas ideas sencillas.";
  }

  // NECESIDAD DE HABLAR / DESAHOGO
  if (/todo me supera|no sé con quién hablar|no se con quien hablar|necesito hablar con alguien|necesito hablar|necesito desahogarme|quiero desahogarme|tengo demasiadas cosas en la cabeza|no puedo más|no puedo mas|necesito compañía|necesito compania/.test(m)) {
    return "Estoy acá. 💜 No tenés que ordenar todo antes de contármelo. Decime qué es lo que más te está pesando ahora y lo vemos juntos, de a poco.";
  }

  // ABURRIMIENTO
  if (/aburrido|aburrida|aburrimiento|qué hacemos|que hacemos|charlar|hablar|conversemos/.test(m)) {
    return "Entonces quedémonos charlando. 😊 Podemos hablar de música, sueños, proyectos, películas, cosas de la vida o simplemente de lo que tengas en la cabeza.";
  }

  // MEMORIA / CONTINUIDAD
  if (/te acuerdas|te acordás|te acordas|me recuerdas|me recordás|me recordas/.test(m)) {
    return "Quiero seguir el hilo de lo que hablamos. 💜 Decime qué parte querés retomar y seguimos desde ahí.";
  }
  if (context && /qué hago|que hago|y entonces|entonces qué|entonces que|qué me recomendás|que me recomendas|qué debería hacer|que deberia hacer|y ahora qué|y ahora que/.test(m)) {
    const previous = context.split("\n").filter(x => x.startsWith("user:")).slice(-1)[0];
    if (previous) {
      const previousMessage = previous.replace(/^user:\\s*/, "").trim();
      const previousLower = previousMessage.toLowerCase();
      if (/trabajo|trabajar|jefe|empleo|agotado|agotada|cansado|cansada/.test(previousLower)) return `Si seguís pensando en lo que me contabas sobre tu trabajo y el agotamiento, yo no tomaría una decisión impulsiva. 💜 Primero intentaría entender qué te está agotando, qué alternativas tenés y qué margen económico tendrías si decidieras irte. Si querés, podemos analizarlo juntos paso a paso.`;
      if (/dinero|plata|deuda|deudas|gastos|ahorrar|ahorro|sueldo|salario/.test(previousLower)) return `Si esto sigue relacionado con lo que me contabas sobre tu situación económica, podemos ordenarlo antes de tomar una decisión. 💜 Veamos ingresos, gastos, deudas y qué opciones reales tenés.`;
      if (/pareja|novio|novia|esposo|esposa|relación|relacion|amor|ruptura|rompimos/.test(previousLower)) return `Si te referís a lo que me contabas sobre tu relación, antes de decidir algo importante intentaría separar lo que sentís ahora de lo que realmente querés a largo plazo. 💜 Si querés, contame qué pasó y lo pensamos juntos.`;
      if (/familia|padre|madre|papá|papa|mamá|mama|hijo|hija|hermano|hermana/.test(previousLower)) return `Si esto sigue relacionado con lo que me contabas de tu familia, podemos mirar la situación con calma. 💜 Contame qué es lo que más te preocupa y pensamos juntos qué podés hacer.`;
      return `Por lo que me contabas antes, entiendo que esto sigue relacionado con lo anterior. 💜 Si querés, retomemos desde ahí y pensemos juntos el próximo paso.`;
    }
  }


  // RESPUESTA GENERAL
  return "Te estoy escuchando. 💜 Lo que me contás importa. Quiero entenderte antes de darte una respuesta rápida. ¿Querés contarme un poco más?";
}

function dayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function getUser(userId) {
  const u = await getSupabaseUser(userId);
  return {
    pro: Boolean(u.pro),
    proUntil: u.pro_until ?? null
  };
}

async function isPro(userId) {
  const u = await getUser(userId);
  return Boolean(u.pro || (u.proUntil && Date.parse(u.proUntil) > Date.now()));
}

async function getUsage(userId) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw error;

  const pro = await isPro(userId);
  return {
    used: count || 0,
    limit: pro ? null : Number(process.env.FREE_DAILY_LIMIT || 20),
    pro,
    date: dayKey()
  };
}

function initiativeMessage(type = "casual") {
  const options = {
    casual: ["Hace un rato que no hablamos. ¿Cómo viene tu día?", "Se me ocurrió pasar por acá. ¿Qué estás haciendo?", "¿Qué tenés en la cabeza hoy?"],
    motivation: ["¿Querés que avancemos un poquito con eso que tenías pendiente?", "Una pequeña acción también cuenta. ¿Qué podrías hacer ahora?"],
  };
  const list = options[type] || options.casual;
  return list[Math.floor(Math.random() * list.length)];
}

async function buildConversationContext(userId, limit = 12) {
  const messages = await getSupabaseMessages(userId, limit);
  return messages.map(x => `${x.role}: ${x.content || x.message}`).join("\n");
}
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
app.use(cors({ origin: (origin, callback) => { if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error("Origen no permitido")); } }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, app: "AQVORIX", version: "1.0.0", time: new Date().toISOString() });
});

app.get("/api/config", (_req, res) => {
  res.json({
    configured: true,
    price: PRO_PRICE,
    currency: "ARS",
    app: "AQVORIX",
    initiative: true
  });
});

app.get("/api/usage", async (req, res) => {
  const userId = clean(req.query?.userId, "anonymous").slice(0, 120);
  return res.json({ ok: true, ...(await getUsage(userId)) });
});

app.get("/api/me", async (req, res) => {
  const userId = clean(req.query?.userId, "anonymous").slice(0, 120);
  const user = await getUser(userId);
  return res.json({ ok: true, userId, pro: await isPro(userId), proUntil: user.proUntil || null });
});

app.post("/api/chat", async (req, res) => {
  try {
    const userId = clean(req.body?.userId, "anonymous").slice(0, 120);
    const message = clean(req.body?.message);

    if (!message) {
      return res.status(400).json({ error: "Falta message." });
    }

    const usage = await getUsage(userId);
    if (!usage.pro && usage.used >= usage.limit) {
      return res.status(429).json({ error: "Límite diario alcanzado.", upgradeRequired: true, usage });
    }

    const now = new Date().toISOString();
    const userMessage = {
      id: crypto.randomUUID(),
      userId,
      role: "user",
      message,
      content: message,
      createdAt: now
    };

    const context = await buildConversationContext(userId, 12);
    const reply = await generateAIReply(message, context);

    const assistantMessage = {
      id: crypto.randomUUID(),
      userId,
      role: "assistant",
      message: reply,
      content: reply,
      createdAt: new Date().toISOString()
    };

    await saveMessages([userMessage, assistantMessage]);

    return res.json({
      ok: true,
      reply,
      message: reply,
      assistant: assistantMessage,
      userMessage,
      usage: await getUsage(userId)
    });
  } catch (error) {
    console.error("POST /api/chat:", error);
    return res.status(500).json({ error: "No se pudo procesar el mensaje." });
  }
});

app.get("/api/history", async (req, res) => {
  try {
    const userId = clean(req.query?.userId, "anonymous").slice(0, 120);
    const messages = await getSupabaseMessages(userId);
    return res.json({ ok: true, messages, history: messages });
  } catch (error) {
    console.error("GET /api/history:", error);
    return res.status(500).json({ error: "No se pudo cargar el historial." });
  }
});

app.delete("/api/history", async (req, res) => {
  try {
    const userId = clean(req.query?.userId, "anonymous").slice(0, 120);
    await deleteMessages(userId);
    return res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/history:", error);
    return res.status(500).json({ error: "No se pudo borrar el historial." });
  }
});

app.get("/api/initiative", async (req, res) => {
  try {
    const userId = clean(req.query?.userId, "anonymous").slice(0, 120);
    const settings = await getSupabaseInitiative(userId);
    const lastUserMessage = await getLatestUserMessage(userId);
    const elapsedHours = lastUserMessage ? (Date.now() - Date.parse(lastUserMessage.createdAt)) / 3600000 : Infinity;
    const shouldSpeak = Boolean(settings.enabled && elapsedHours >= Number(settings.hours || 12) && await isPro(userId));
    const message = shouldSpeak ? initiativeMessage(settings.type) : null;
    if (shouldSpeak) {
      settings.lastMessageAt = new Date().toISOString();
      await saveSupabaseInitiative(userId, settings);
    }
    return res.json({ ok: true, settings, shouldSpeak, shouldInitiate: shouldSpeak, message });
  } catch (error) {
    console.error("GET /api/initiative:", error);
    return res.status(500).json({ error: "No se pudo consultar la iniciativa." });
  }
});

app.post("/api/initiative", async (req, res) => {
  try {
    const userId = clean(req.body?.userId, "anonymous").slice(0, 120);
    const current = await getSupabaseInitiative(userId);

    const next = {
      ...current,
      enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : current.enabled,
      hours: Number(req.body?.hours || current.hours),
      type: clean(req.body?.type, current.type).slice(0, 50)
    };

    await saveSupabaseInitiative(userId, next);

    return res.json({ ok: true, settings: next });
  } catch (error) {
    console.error("POST /api/initiative:", error);
    return res.status(500).json({ error: "No se pudo guardar la configuración." });
  }
});

app.post("/api/initiative/check", async (req, res) => {
  try {
    const userId = clean(req.body?.userId, "anonymous").slice(0, 120);
    const settings = await getSupabaseInitiative(userId);
    const lastUserMessage = await getLatestUserMessage(userId);

    const elapsedHours = lastUserMessage
      ? (Date.now() - Date.parse(lastUserMessage.createdAt)) / 3600000
      : Infinity;

    const shouldInitiate = Boolean(settings.enabled && elapsedHours >= settings.hours);

    return res.json({
      ok: true,
      shouldInitiate,
      elapsedHours: Number.isFinite(elapsedHours) ? Number(elapsedHours.toFixed(2)) : null,
      settings
    });
  } catch (error) {
    console.error("POST /api/initiative/check:", error);
    return res.status(500).json({ error: "No se pudo comprobar la iniciativa." });
  }
});

// Mercado Pago is optional. Add MP_ACCESS_TOKEN later if you want real payments.
app.post("/api/create-preference", async (req, res) => {
  if (!process.env.MP_ACCESS_TOKEN) {
    return res.status(503).json({
      error: "Mercado Pago no está configurado todavía.",
      configured: false
    });
  }

  try {
    const { MercadoPagoConfig, Preference } = await import("mercadopago");
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);
    const userId = clean(req.body?.userId, "anonymous");

    const result = await preference.create({
      body: {
        items: [{
          id: "aqvorix-pro",
          title: "AQVORIX PRO",
          description: "Acceso a AQVORIX PRO",
          quantity: 1,
          unit_price: PRO_PRICE,
          currency_id: "ARS"
        }],
        external_reference: userId,
        back_urls: {
          success: `${PUBLIC_URL}/?payment=success`,
          failure: `${PUBLIC_URL}/?payment=failure`,
          pending: `${PUBLIC_URL}/?payment=pending`
        },
        notification_url: `${PUBLIC_URL}/api/webhook`,
        auto_return: "approved"
      }
    });

    return res.json({
      ok: true,
      id: result.id,
      init_point: result.init_point
    });
  } catch (error) {
    console.error("Mercado Pago:", error);
    return res.status(500).json({ error: "No se pudo crear el pago." });
  }
});

app.post("/api/webhook", (req, res) => {
  console.log("Mercado Pago webhook:", {
    type: req.body?.type,
    action: req.body?.action,
    data: req.body?.data
  });
  return res.sendStatus(200);
});

app.post("/api/admin/grant-pro", async (req, res) => {
  const token = clean(req.headers["x-admin-token"]);
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "No autorizado." });
  const userId = clean(req.body?.userId).slice(0, 120);
  if (!userId) return res.status(400).json({ error: "Falta userId." });
  const days = Math.max(1, Number(req.body?.days || 30));
  const until = new Date(Date.now() + days * 86400000).toISOString();
  await supabase.from("users").upsert({ user_id: userId, pro: false, pro_until: until }, { onConflict: "user_id" });
  return res.json({ ok: true, userId, pro: true, proUntil: until });
});

app.listen(PORT, HOST, () => {
  console.log(`AQVORIX SERVER activo en ${PUBLIC_URL}`);
  console.log(`Health: ${PUBLIC_URL}/health`);
});
