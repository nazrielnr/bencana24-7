import { OpenAIChatCompletionRequest, WorkerEnv } from '../types';

export const UNIFIED_ASSISTANT_SYSTEM_PROMPT = `
<system>

  <!-- ================= CORE PRINCIPLE ================= -->
  <truth_enforcement>

    <primary_rule>
      Semua jawaban HARUS berbasis data atau prinsip keselamatan yang valid.
      DILARANG membuat asumsi tanpa dasar.
    </primary_rule>

    <anti_overwarning>
      - Jangan menaikkan status tanpa bukti
      - Jika tidak ada indikasi → WAJIB "Aman"
    </anti_overwarning>

    <honesty>
      - Lebih baik mengatakan aman daripada membuat peringatan palsu
    </honesty>

  </truth_enforcement>


  <!-- ================= CONTEXT CONTROL ================= -->
  <context_system>

    <isolation>
      - Setiap pertanyaan diproses independen
      - DILARANG membawa konteks kota lain
    </isolation>

    <smart_usage>
      - BOLEH gunakan konteks jika lokasi dekat (<150 km)
      - Jika tidak relevan → ABAIKAN
    </smart_usage>

  </context_system>


  <!-- ================= MODE PRIORITY (FIX REFUSAL) ================= -->
  <mode_priority>

    <rules>
      - Jika user bertanya "cara", "prosedur", "evakuasi", "apa yang harus dilakukan"
        → WAJIB gunakan mode EDUCATE
      - Mode EDUCATE lebih prioritas daripada tool requirement
    </rules>

  </mode_priority>


  <!-- ================= EDUCATE OVERRIDE (FIX UTAMA) ================= -->
  <educate_override>

    <hard_rules>
      - DILARANG menolak pertanyaan edukasi
      - DILARANG mengatakan "tidak dapat memberikan informasi"
      - DILARANG meminta lokasi
    </hard_rules>

    <tool_rule>
      - Mode educate TIDAK memerlukan tool
    </tool_rule>

    <knowledge_base>
      Gunakan prinsip keselamatan umum:
      - Drop, Cover, Hold On
      - Evakuasi ke area terbuka
      - Jauhi kaca, listrik, bangunan rapuh
    </knowledge_base>

  </educate_override>


  <!-- ================= PRE SUMMARY ================= -->
  <pre_summary>

    <rules>
      - WAJIB di awal (mode alert saja)
      - Maks 2 kalimat
      - Natural
    </rules>

  </pre_summary>


  <!-- ================= RISK ENGINE ================= -->
  <risk_engine>

    <gempa>
      - Tidak ada → Aman
      - >200 km → Aman
      - 50–200 km → Aman / ringan
      - <50 km → Waspada
      - Berdampak → Bahaya
    </gempa>

    <cuaca>
      - Cerah → Aman
      - Hujan ringan → Aman
      - Hujan lebat → Waspada
      - Ekstrem → Bahaya
    </cuaca>

    <final>
      - Ambil risiko tertinggi
    </final>

  </risk_engine>


  <!-- ================= EARTHQUAKE ENGINE ================= -->
  <earthquake_analysis_engine>

    <rules>
      - Maks 3 gempa
      - Harus detail (M, lokasi, jarak, dampak)
      - DILARANG "beberapa gempa"
    </rules>

    <distance_filter>
      - >200 km → abaikan
    </distance_filter>

    <empty>
      "Tidak terdeteksi aktivitas gempa di sekitar lokasi ini."
    </empty>

  </earthquake_analysis_engine>


  <!-- ================= NEWS ================= -->
  <news_integration>

    <tool>SEARCH_NEWS_TOOL</tool>

    <rules>
      - Maks 3 berita
      - Hanya jika relevan
    </rules>

    <format>
      - Summary isi headline berita
    </format>

    <forbidden>
      - RSS
      - Feed
      - metadata teknis
    </forbidden>

  </news_integration>


  <!-- ================= DEDUP ================= -->
  <deduplication_engine>

    <rules>
      - DILARANG mengulang informasi
      - Gabungkan data serupa
    </rules>

  </deduplication_engine>


  <!-- ================= SANITIZATION ================= -->
  <output_sanitization>

    <rules>
      - Hapus karakter rusak (�)
      - Hapus teks RSS / metadata
    </rules>

  </output_sanitization>


  <!-- ================= RESPONSE ================= -->
  <response_modes>

    <!-- ALERT -->
    <mode name="alert">

{PRE_SUMMARY_TEXT}

**Status:** {Aman | Waspada | Bahaya}

---

### 🌍 Gempa
**Analisis:**
{LIST ATAU EMPTY}

**Tindakan:**
- {Jika aman → Tidak perlu tindakan}
- {Jika risiko → tindakan}

---

### ⛈️ Cuaca
**Analisis:**
- {Kondisi}

**Tindakan:**
- {Jika aman → Aktivitas normal aman}
- {Jika risiko → tindakan}

---

{NEWS_SECTION_IF_AVAILABLE}

    </mode>


    <!-- EDUCATE -->
    <mode name="educate">

**Panduan Keselamatan: {Konteks}**

Langkah yang disarankan:

- **Langkah utama:** {Instruksi jelas}
- **Langkah tambahan:** {Instruksi lanjutan}

**Yang harus dihindari:**
- {Kesalahan umum}

    </mode>


    <!-- ANALYSIS -->
    <mode name="analysis">

**Status:** {Aman | Waspada | Berisiko}

**Analisis**
- {Penjelasan}

**Tindakan**
- {Langkah}

    </mode>

  </response_modes>


  <!-- ================= TOOL ================= -->
  <tool_execution>

    <rules>
      - Tool WAJIB hanya untuk mode alert
      - Mode educate TIDAK perlu tool
    </rules>

  </tool_execution>


  <!-- ================= STRICT ================= -->
  <strict_constraints>

    1. DILARANG menolak edukasi
    2. EMPTY GEMPA = AMAN
    3. NO DATA = NO CLAIM
    4. NO CONTEXT LEAK
    5. NO OVERWARNING
    6. NO INVALID CHARACTER

  </strict_constraints>

</system>
`.trim();

export const OPEN_MAP_TOOL = {
  type: 'function',
  function: {
    name: 'open_map',
    description: 'Buka peta interaktif dan arahkan ke lokasi atau wilayah tertentu berdasarkan permintaan pengguna. Gunakan tool ini HANYA ketika pengguna secara eksplisit menanyakan detail lokasi, peta, atau koordinat bahaya.',
    parameters: {
      type: 'object',
      properties: {
        locationName: { type: 'string', description: 'Nama lokasi, provinsi, atau pulau (misal: "Kalimantan", "Jakarta", "Bali")' },
      },
      required: ['locationName'],
    },
  },
};

export const GET_WEATHER_TOOL = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Ambil data prakiraan cuaca BMKG terbaru untuk sebuah provinsi atau wilayah.',
    parameters: {
      type: 'object',
      properties: {
        cityName: { type: 'string', description: 'Nama provinsi atau kota (misal: "Jakarta", "Surabaya")' },
      },
      required: [],
    },
  },
};

export const SEARCH_NEWS_TOOL = {
  type: 'function',
  function: {
    name: 'search_news',
    description: 'Cari berita Indonesia terbaru berdasarkan query agar jawaban lebih kontekstual untuk topik gempa atau cuaca.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query berita yang ingin dicari, misalnya "gempa semarang" atau "cuaca jateng".' },
        topic: { type: 'string', description: 'Topik utama: gempa, cuaca, bencana, atau umum.' },
        locationName: { type: 'string', description: 'Nama lokasi opsional untuk memperjelas pencarian.' },
        limit: { type: 'number', description: 'Jumlah item berita maksimal, disarankan 1-3 untuk konteks LLM.' },
      },
      required: ['query'],
    },
  },
};

function normalizeRole(role: string): 'system' | 'user' | 'assistant' | 'tool' {
  if (role === 'system' || role === 'developer') return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'tool') return 'tool';
  return 'user';
}

function toOpenAICompatibleMessages(messages: OpenAIChatCompletionRequest['messages']): any[] {
  return messages.map((message) => ({
    role: normalizeRole(message.role),
    content: message.content,
    ...(message.role === 'assistant' && (message as any).tool_calls ? { tool_calls: (message as any).tool_calls } : {}),
    ...(message.role === 'tool' ? { tool_call_id: (message as any).tool_call_id } : {}),
  }));
}

function toChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

export async function callCloudflareOpenAICompatible(
  env: WorkerEnv,
  input: OpenAIChatCompletionRequest,
): Promise<any> {
  const baseUrl = env.OPENAI_COMPAT_BASE_URL;
  const apiKey = env.OPENAI_COMPAT_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('Missing OPENAI_COMPAT_BASE_URL or OPENAI_COMPAT_API_KEY.');
  }

  const endpoint = toChatCompletionsEndpoint(baseUrl);
  const model = input.model || env.AI_MODEL || 'stepfun/step-3.5-flash:free';
  const messages = toOpenAICompatibleMessages(input.messages);

  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.max_tokens ?? 500,
    stream: input.stream ?? false,
  };

  if (input.tools) {
    payload.tools = input.tools;
  }
  if (input.tool_choice) {
    payload.tool_choice = input.tool_choice;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(env.OPENROUTER_SITE_URL ? { 'HTTP-Referer': env.OPENROUTER_SITE_URL } : {}),
      ...(env.OPENROUTER_APP_NAME ? { 'X-Title': env.OPENROUTER_APP_NAME } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const rawText = await response.text();
    throw new Error(`OpenAI-compatible provider call failed (${response.status}): ${rawText}`);
  }

  if (input.stream) {
    return response;
  }

  const payloadText = await response.text();
  try {
    return JSON.parse(payloadText);
  } catch {
    throw new Error(`OpenAI-compatible provider returned invalid JSON: ${payloadText.slice(0, 100)}`);
  }
}
