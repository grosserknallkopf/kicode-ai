/**
 * KiCode AI Proxy Worker
 * 
 * - Leitet Chat-Requests an den Vercel AI Gateway weiter
 * - Fügt Gateway-Optionen hinzu (No Training, Cost-Sort, Tool-Use)
 * - CORS-Handling
 * - Rate Limiting pro User
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Id',
  'Access-Control-Max-Age': '86400',
};

// Rate-Limit: 100 Requests pro Minute pro User
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 100;

  if (!rateLimitMap.has(userId)) {
    rateLimitMap.set(userId, []);
  }
  const timestamps = rateLimitMap.get(userId).filter(t => now - t < windowMs);
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);

  return timestamps.length <= maxRequests;
}

async function handleRequest(request, env) {
  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const userId = request.headers.get('X-User-Id') || 'anonymous';

  // Rate limit check
  if (!checkRateLimit(userId)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { messages, model, stream = true } = body;

    // Gateway-Request zusammenbauen
    const gatewayPayload = {
      model: model || 'deepseek/deepseek-v4.1-flash',
      messages,
      stream,
      // Gateway-spezifische Optionen
      gateway: {
        sort: 'cost',
        disallowPromptTraining: true,
        has: ['tool-use'],
        user: userId,
        tags: ['kicode-agent', 'worker-proxy'],
        models: [
          'deepseek/deepseek-v4-flash',
          'google/gemini-3.8-flash',
        ],
      },
    };

    const response = await fetch(`${env.GATEWAY_URL || 'https://ai-gateway.vercel.sh'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
      },
      body: JSON.stringify(gatewayPayload),
    });

    // Stream oder JSON-Antwort
    if (stream) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Internal proxy error',
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }
}

export default {
  fetch: handleRequest,
};