export const VOICE_AUDIO = {
  backendPlaybackRate: 1.0,
  browserRate: 1.02,
  browserPitch: 0.85,
  ttsTimeoutMs: 4500,
};

export async function fetchTtsAudio(text: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_AUDIO.ttsTimeoutMs);

  try {
    const res = await fetch("/api/agents/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    return buf.byteLength > 100 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function pickAtlasVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find(v =>
    v.name.includes("Google UK English Male") ||
    v.name.includes("Microsoft Guy") ||
    v.name.includes("Microsoft Ryan") ||
    v.name.includes("Daniel") ||
    (v.lang.startsWith("en") && v.name.toLowerCase().includes("natural") && !v.name.toLowerCase().includes("female"))
  ) ?? voices.find(v =>
    v.lang === "en-GB" && !v.name.toLowerCase().includes("female")
  ) ?? voices.find(v =>
    v.lang.startsWith("en") && !v.name.toLowerCase().includes("female")
  ) ?? voices.find(v => v.lang.startsWith("en"));
}

export function configureAtlasUtterance(utt: SpeechSynthesisUtterance, voices: SpeechSynthesisVoice[] = []) {
  const voice = pickAtlasVoice(voices);
  if (voice) utt.voice = voice;
  utt.rate = VOICE_AUDIO.browserRate;
  utt.pitch = VOICE_AUDIO.browserPitch;
}
