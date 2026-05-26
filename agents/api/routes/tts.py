import io
import os
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
_log = logging.getLogger("rwai.tts")


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None


_CACHE_LIMIT = 32
_audio_cache: dict[str, bytes] = {}


def _remember_audio(key: str, audio: bytes):
    if len(_audio_cache) >= _CACHE_LIMIT:
        _audio_cache.pop(next(iter(_audio_cache)), None)
    _audio_cache[key] = audio


def _speed() -> float:
    try:
        return max(0.75, min(1.25, float(os.getenv("OPENAI_TTS_SPEED", "1.0"))))
    except ValueError:
        return 1.0


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    text = " ".join(req.text.split())[:480].strip()
    if not text:
        return JSONResponse({"error": "empty text"}, status_code=400)

    import httpx

    # Option 1: OpenAI TTS — onyx voice (best quality, needs OPENAI_API_KEY)
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if openai_key and not openai_key.startswith("your_"):
        model = os.getenv("OPENAI_TTS_MODEL", "tts-1")
        voice = (req.voice or os.getenv("OPENAI_TTS_VOICE", "onyx")).strip() or "onyx"
        speed = _speed()
        cache_key = f"openai:{model}:{voice}:{speed}:{text}"
        cached = _audio_cache.get(cache_key)
        if cached:
            return StreamingResponse(io.BytesIO(cached), media_type="audio/mpeg")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={"model": model, "input": text, "voice": voice, "speed": speed},
                )
                if res.status_code == 200:
                    _remember_audio(cache_key, res.content)
                    return StreamingResponse(io.BytesIO(res.content), media_type="audio/mpeg")
                _log.warning("OpenAI TTS error %s", res.status_code)
        except Exception as exc:
            _log.warning("OpenAI TTS failed: %s", exc)

    # Option 2: gTTS — Google Translate TTS (reliable, no API key needed)
    # Note: frontend keeps playback at natural speed and falls back quickly if this stalls.
    cache_key = f"gtts:{text}"
    cached = _audio_cache.get(cache_key)
    if cached:
        return StreamingResponse(io.BytesIO(cached), media_type="audio/mpeg")
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang=os.getenv("GTTS_LANG", "en"), tld=os.getenv("GTTS_TLD", "com"), slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        _remember_audio(cache_key, buf.getvalue())
        _log.info("gTTS OK, %d chars", len(text))
        return StreamingResponse(buf, media_type="audio/mpeg")
    except Exception as exc:
        _log.warning("gTTS failed: %s", exc)

    return JSONResponse({"error": "TTS unavailable"}, status_code=503)
