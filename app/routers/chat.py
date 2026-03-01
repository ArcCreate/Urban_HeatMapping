# app/routers/chat.py
from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends

from app.dependencies import get_anthropic
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat import build_system_prompt

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    anthropic: AsyncAnthropic = Depends(get_anthropic),
) -> dict:
    """
    CHAT-01: Accept user question + map context, return Claude reply + token usage.
    Uses claude-haiku-4-5-20251001 (current, non-deprecated; 200K context, 64K output).
    System prompt stays under 2000 tokens regardless of tract count.
    SDK errors propagate to global 500 handler in main.py (v1 acceptable).
    """
    system_prompt = build_system_prompt(body.map_context)
    message = await anthropic.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system_prompt,
        messages=[{"role": "user", "content": body.message}],
    )
    return {
        "reply": message.content[0].text,
        "usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens,
        },
    }
