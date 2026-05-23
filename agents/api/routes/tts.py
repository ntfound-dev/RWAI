import io
import os
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

router = APIRouter()
_log = logging.getLogger("rwai.tts")


class TTSRequest(BaseModel):
    text: str


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    text = req.text[:600].strip()
    if not text:
        return JSONResponse({"error": "empty text"}, status_code=400)

    import httpx

    # Option 1: OpenAI TTS — onyx voice (best quality, needs OPENAI_API_KEY)
    openai_key = os.getenv("OPENAI_API_KEY", "")
    if openai_key and not openai_key.startswith("your_"):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                res = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json={"model": "tts-1", "input": text, "voice": "onyx", "speed": 0.88},
                )
                if res.status_code == 200:
                    return StreamingResponse(io.BytesIO(res.content), media_type="audio/mpeg")
                _log.warning("OpenAI TTS error %s", res.status_code)
        except Exception as exc:
            _log.warning("OpenAI TTS failed: %s", exc)

    # Option 2: gTTS — Google Translate TTS (reliable, no API key needed)
    # Note: Groq playai-tts was decommissioned; frontend lowers pitch via playbackRate
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang="en", tld="com")
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        _log.info("gTTS OK, %d chars", len(text))
        return StreamingResponse(buf, media_type="audio/mpeg")
    except Exception as exc:
        _log.warning("gTTS failed: %s", exc)

    return JSONResponse({"error": "TTS unavailable"}, status_code=503)
