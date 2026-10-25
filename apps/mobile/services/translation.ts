import { translateMessageApi } from "./api";

// Fast in-memory cache for translated strings to avoid duplicate network calls
const translationMemoryCache = new Map<string, string>();

/**
 * Instant local dictionary for common chat messages, greetings, short phrases,
 * and frequent Hinglish (Romanized Hindi) expressions.
 * Yields instant (0ms) translation without waiting for any network roundtrips.
 */
const COMMON_HINDI_DICTIONARY: Record<string, string> = {
  // Common Hinglish phrases
  "sb sahi": "सब सही",
  "sb sahi hai": "सब सही है",
  "sab sahi": "सब सही",
  "sab sahi hai": "सब सही है",
  "sb theek": "सब ठीक",
  "sb theek hai": "सब ठीक है",
  "sab theek": "सब ठीक",
  "sab theek hai": "सब ठीक है",
  "sb thik": "सब ठीक",
  "sab thik": "सब ठीक",
  "sb badhiya": "सब बढ़िया",
  "sab badhiya": "सब बढ़िया",
  "sb badiya": "सब बढ़िया",
  "sab badiya": "सब बढ़िया",
  "kya haal": "क्या हाल",
  "kya haal hai": "क्या हाल है",
  "kya hal hai": "क्या हाल है",
  "kya chal raha hai": "क्या चल रहा है",
  "kya chal rha h": "क्या चल रहा है",
  "kya kar rahe ho": "क्या कर रहे हो",
  "kya kar rhe ho": "क्या कर रहे हो",
  "kaha ho": "कहाँ हो",
  "kahan ho": "कहाँ हो",
  "kidhar ho": "किधर हो",
  "kaise ho": "कैसे हो",
  "theek hai": "ठीक है",
  "thik hai": "ठीक है",
  "theek h": "ठीक है",
  "sahi hai": "सही है",
  "sahi h": "सही है",
  "kuch nahi": "कुछ नहीं",
  "kch nhi": "कुछ नहीं",
  "kuch nhi": "कुछ नहीं",
  "batao bhai": "बताओ भाई",
  "bolo bhai": "बोलो भाई",
  "chalo milte hain": "चलो मिलते हैं",
  "chalo milte h": "चलो मिलते हैं",
  "ha bhai": "हाँ भाई",
  "haan bhai": "हाँ भाई",
  "nahi bhai": "नहीं भाई",
  "nhi bhai": "नहीं भाई",
  "shukriya bhai": "शुक्रिया भाई",
  "achha bhai": "अच्छा भाई",
  "accha bhai": "अच्छा भाई",
  "theek hai bhai": "ठीक है भाई",
  "sab mast": "सब मस्त",
  "ekdum mast": "एकदम मस्त",
  "ekdum badhiya": "एकदम बढ़िया",

  // English Greetings & Status
  hey: "हे",
  heyy: "हे",
  heyyy: "हे",
  heyyyy: "हे",
  hi: "नमस्ते",
  hii: "नमस्ते",
  hiii: "नमस्ते",
  hello: "नमस्ते",
  helloo: "नमस्ते",
  "all good": "सब ठीक है",
  "all right": "सब ठीक है",
  "everything good": "सब कुछ ठीक है",
  "everything is fine": "सब कुछ ठीक है",
  "good morning": "सुप्रभात",
  "good night": "शुभ रात्रि",
  "good afternoon": "शुभ दोपहर",
  "good evening": "शुभ संध्या",
  "see you": "फिर मिलते हैं",
  "see you soon": "जल्द मिलते हैं",
  "see you later": "बाद में मिलते हैं",
  bye: "अलविदा",
  byee: "अलविदा",
  goodbye: "अलविदा",
  "take care": "ख्याल रखना",

  // Questions
  "how are you": "आप कैसे हैं?",
  "how are you?": "आप कैसे हैं?",
  "how r u": "आप कैसे हैं?",
  "how r u?": "आप कैसे हैं?",
  "what are you doing": "आप क्या कर रहे हैं?",
  "what are you doing?": "आप क्या कर रहे हैं?",
  "what are u doing": "आप क्या कर रहे हैं?",
  "what are u doing?": "आप क्या कर रहे हैं?",
  "where are you": "आप कहाँ हैं?",
  "where are you?": "आप कहाँ हैं?",
  "where are u": "आप कहाँ हैं?",
  "where are u?": "आप कहाँ हैं?",
  "where are you going": "आप कहाँ जा रहे हैं?",
  "where are you going?": "आप कहाँ जा रहे हैं?",
  "what happened": "क्या हुआ?",
  "what happened?": "क्या हुआ?",
  "what's up": "क्या चल रहा है?",
  "what's up?": "क्या चल रहा है?",
  "whats up": "क्या चल रहा है?",
  "whats up?": "क्या चल रहा है?",
  "who are you": "आप कौन हैं?",
  "who are you?": "आप कौन हैं?",

  // Single common conversational tokens
  bolo: "बोलो",
  suno: "सुनो",
  batao: "बताओ",
  chalo: "चलो",
  aao: "आओ",
  jao: "जाओ",
  ruko: "रुको",
  ruk: "रुक",
  theek: "ठीक",
  thik: "ठीक",
  sahi: "सही",
  badhiya: "बढ़िया",
  badiya: "बढ़िया",
  mast: "मस्त",
  kaha: "कहाँ",
  kahan: "कहाँ",
  kaise: "कैसे",
  kya: "क्या",
  kyu: "क्यों",
  kyun: "क्यों",
  acha: "अच्छा",
  accha: "अच्छा",
  achha: "अच्छा",
  shukriya: "शुक्रिया",
  dost: "दोस्त",
  bhai: "भाई",
  bro: "भाई",
  yaar: "यार",
  haan: "हाँ",
  ha: "हाँ",
  nhi: "नहीं",
  nahi: "नहीं",
  na: "ना",
  "i am fine": "मैं ठीक हूँ",
  "i am good": "मैं ठीक हूँ",
  "i am ok": "मैं ठीक हूँ",
  fine: "ठीक",
  good: "अच्छा",
  ok: "ठीक है",
  okay: "ठीक है",
  okk: "ठीक है",
  yes: "हाँ",
  yeah: "हाँ",
  yep: "हाँ",
  no: "नहीं",
  nope: "नहीं",
  sure: "ज़रूर",
  maybe: "शायद",
  please: "कृपया",
  thanks: "धन्यवाद",
  "thank you": "धन्यवाद",
  "thank you so much": "बहुत-बहुत धन्यवाद",
  welcome: "स्वागत है",
  "you're welcome": "आपका स्वागत है",
  sorry: "माफ़ कीजिये",
  "i am sorry": "मुझे माफ़ कर दो",
  "no problem": "कोई बात नहीं",
  cool: "बहुत बढ़िया",
  awesome: "शानदार",
  great: "बहुत अच्छा",
  nice: "अच्छा है",
  call: "कॉल करें",
  "call me": "मुझे कॉल करो",
  "call me later": "मुझे बाद में कॉल करना",
  wait: "रुको",
  "wait a minute": "एक मिनट रुको",
  "let's go": "चलो चलें",
  "let's meet": "मिलते हैं",
  congratulations: "बधाई हो",
  congrats: "बधाई हो",
  "happy birthday": "जन्मदिन मुबारक",
};

/**
 * Checks if a string contains Devanagari (Hindi) characters
 */
export function isHindiText(text: string): boolean {
  return /[\u0900-\u097F]/.test(text || "");
}

/**
 * Synchronously retrieves cached Hindi translation or instant dictionary match
 */
export function getCachedHindi(text: string): string | undefined {
  const clean = (text || "").trim();
  if (!clean) return "";

  // 1. Check in-memory translation cache
  const cached = translationMemoryCache.get(clean);
  if (cached) return cached;

  // 2. Check instant common dictionary (case-insensitive)
  const lower = clean.toLowerCase();
  const dictHit = COMMON_HINDI_DICTIONARY[lower];
  if (dictHit) {
    translationMemoryCache.set(clean, dictHit);
    return dictHit;
  }

  // 3. Try normalizing trailing punctuation: e.g. "Sb sahi!" -> "Sb sahi"
  const stripped = lower.replace(/[!?.,]+$/g, "").trim();
  if (COMMON_HINDI_DICTIONARY[stripped]) {
    const res = COMMON_HINDI_DICTIONARY[stripped];
    translationMemoryCache.set(clean, res);
    return res;
  }

  return undefined;
}

/**
 * Translates English or Hinglish text to Hindi with extreme accuracy and speed:
 * 1. Instant (0ms) local dictionary lookup
 * 2. In-memory translation cache (0ms)
 * 3. Direct Google Translate GTX endpoint (~150ms-300ms) with 2.5s timeout
 * 4. Hinglish / Romanized Hindi transliteration fallback via Google Input Tools (e.g. "Sb sahi" -> "सब सही")
 * 5. Fallback to backend `/api/messages/translate` with 2.5s timeout
 * 6. Fallback to MyMemory API with 2.5s timeout
 */
export async function translateToHindi(text: string): Promise<string> {
  const clean = (text || "").trim();
  if (!clean) return "";

  // If already in cache or dictionary, return immediately (0ms)
  const cached = getCachedHindi(clean);
  if (cached) return cached;

  let gtxResult = "";

  // 1. High-speed Direct Google Translate GTX (Client-to-Google CDN: ~150-300ms)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=hi&dt=t&q=${encodeURIComponent(clean)}`;
    const response = await fetch(gtxUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = (await response.json()) as any;
      if (Array.isArray(data) && Array.isArray(data[0])) {
        gtxResult = data[0]
          .map((item: any) => item[0])
          .join("")
          .trim();
        // If translation produced valid Hindi Devanagari characters:
        if (gtxResult) {
          const hasHindi = /[\u0900-\u097F]/.test(gtxResult);
          if (hasHindi && gtxResult.toLowerCase() !== clean.toLowerCase()) {
            translationMemoryCache.set(clean, gtxResult);
            return gtxResult;
          }
        }
      }
    }
  } catch {
    // Fall through if timeout or network failure
  }

  // 2. Hinglish / Romanized Hindi Fallback: Google Input Tools (e.g. "Sb sahi" -> "सब सही")
  // Triggered when GTX returned untranslated text or Latin script
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const itUrl = `https://inputtools.google.com/request?text=${encodeURIComponent(clean)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
    const itRes = await fetch(itUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (itRes.ok) {
      const itData = (await itRes.json()) as any;
      if (itData[0] === "SUCCESS" && itData[1] && itData[1][0] && itData[1][0][1] && itData[1][0][1][0]) {
        const transliterated = itData[1][0][1][0].trim();
        if (/[\u0900-\u097F]/.test(transliterated)) {
          translationMemoryCache.set(clean, transliterated);
          return transliterated;
        }
      }
    }
  } catch {
    // Fall through
  }

  // 3. Backend API fallback
  try {
    const res = await translateMessageApi(clean, "hi");
    if (res?.translated && res.translated.trim()) {
      const result = res.translated.trim();
      const hasHindi = /[\u0900-\u097F]/.test(result);
      if (hasHindi || result.toLowerCase() !== clean.toLowerCase()) {
        translationMemoryCache.set(clean, result);
        return result;
      }
    }
  } catch {
    // Fall through to MyMemory
  }

  // 4. MyMemory fallback
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const fbUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|hi`;
    const fbRes = await fetch(fbUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (fbRes.ok) {
      const fbData = (await fbRes.json()) as any;
      const translated = fbData?.responseData?.translatedText?.trim();
      if (translated) {
        translationMemoryCache.set(clean, translated);
        return translated;
      }
    }
  } catch {
    // Ignore error
  }

  // Return best effort: gtxResult or clean original
  const fallback = gtxResult || clean;
  if (fallback) {
    translationMemoryCache.set(clean, fallback);
  }
  return fallback;
}
