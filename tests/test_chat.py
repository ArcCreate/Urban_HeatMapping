# tests/test_chat.py
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import chat

# Idempotent router registration guard — matches Phase 3 pattern.
# Allows tests to pass even before main.py wiring (masked by Task 2's wiring step).
if not any(hasattr(r, "path") and "/chat" in getattr(r, "path", "") for r in app.routes):
    app.include_router(chat.router, prefix="/api/v1")


def make_mock_anthropic(reply_text: str = "Test reply from Claude.") -> MagicMock:
    """Return a mock AsyncAnthropic client with messages.create as AsyncMock."""
    mock_content = MagicMock()
    mock_content.text = reply_text

    mock_message = MagicMock()
    mock_message.content = [mock_content]
    mock_message.usage.input_tokens = 42
    mock_message.usage.output_tokens = 17

    mock_anthropic = MagicMock()
    mock_anthropic.messages.create = AsyncMock(return_value=mock_message)
    return mock_anthropic


@pytest.fixture
def client():
    app.state.anthropic = make_mock_anthropic()
    return TestClient(app, raise_server_exceptions=True)


class TestChatEndpoint:
    """Tests for POST /api/v1/chat (CHAT-01)."""

    def test_chat_returns_200_with_reply_and_usage(self, client):
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "Why is this area high risk?",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {
                            "xgb_heat_score": 0.82,
                            "xgb_risk_score": 0.74,
                            "tf_risk_score": 0.71,
                        }
                    },
                    "active_scenario": None,
                },
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0
        assert "usage" in data
        assert "input_tokens" in data["usage"]
        assert "output_tokens" in data["usage"]

    def test_chat_empty_message_returns_422(self, client):
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "",
                "map_context": {"selected_tract_ids": [], "current_scores": {}},
            },
        )
        assert resp.status_code == 422

    def test_chat_no_tracts_selected(self, client):
        """Empty tract selection is valid — system prompt handles it gracefully."""
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "What is the county average?",
                "map_context": {"selected_tract_ids": [], "current_scores": {}},
            },
        )
        assert resp.status_code == 200

    def test_chat_system_prompt_includes_tract_scores(self, client):
        """Verify mock was called and system prompt contains the tract ID."""
        client.post(
            "/api/v1/chat",
            json={
                "message": "Tell me about this tract.",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {
                            "xgb_heat_score": 0.82,
                            "xgb_risk_score": 0.74,
                            "tf_risk_score": 0.71,
                        }
                    },
                    "active_scenario": None,
                },
            },
        )
        app.state.anthropic.messages.create.assert_called_once()
        call_kwargs = app.state.anthropic.messages.create.call_args.kwargs
        assert "system" in call_kwargs
        assert "53033010800" in call_kwargs["system"]

    def test_chat_with_active_scenario(self, client):
        """Active scenario is included in the system prompt without error."""
        resp = client.post(
            "/api/v1/chat",
            json={
                "message": "How much does adding trees help?",
                "map_context": {
                    "selected_tract_ids": ["53033010800"],
                    "current_scores": {
                        "53033010800": {
                            "xgb_heat_score": 0.82,
                            "xgb_risk_score": 0.74,
                            "tf_risk_score": 0.71,
                        }
                    },
                    "active_scenario": {
                        "tree_canopy_pct": 10.0,
                        "albedo_delta": None,
                        "green_space_sqft": None,
                    },
                },
            },
        )
        assert resp.status_code == 200

    def test_chat_missing_message_returns_422(self, client):
        """Missing message field returns 422 validation error."""
        resp = client.post(
            "/api/v1/chat",
            json={"map_context": {"selected_tract_ids": [], "current_scores": {}}},
        )
        assert resp.status_code == 422

    def test_build_system_prompt_50_tracts_stays_under_token_limit(self):
        """Unit test: 50 tracts enumerates IDs and stays under 3000 chars (~750 tokens)."""
        from app.schemas.chat import MapContext, TractScore
        from app.services.chat import build_system_prompt

        tract_ids = [f"5303300{i:04d}" for i in range(50)]
        scores = {
            tid: TractScore(xgb_heat_score=0.5, xgb_risk_score=0.4, tf_risk_score=0.45)
            for tid in tract_ids
        }
        ctx = MapContext(selected_tract_ids=tract_ids, current_scores=scores)
        prompt = build_system_prompt(ctx)
        assert len(prompt) < 3000
        # 50 tracts enumerated — first tract ID must appear
        assert tract_ids[0] in prompt

    def test_build_system_prompt_over_50_tracts_summarizes(self):
        """Unit test: > 50 tracts triggers summary mode — IDs not enumerated."""
        from app.schemas.chat import MapContext, TractScore
        from app.services.chat import build_system_prompt

        tract_ids = [f"5303300{i:04d}" for i in range(51)]
        scores = {
            tid: TractScore(xgb_heat_score=0.5, xgb_risk_score=0.4, tf_risk_score=0.45)
            for tid in tract_ids
        }
        ctx = MapContext(selected_tract_ids=tract_ids, current_scores=scores)
        prompt = build_system_prompt(ctx)
        assert "51 tracts selected" in prompt
        assert "mean=" in prompt
        # Summary mode — individual tract IDs must NOT appear
        assert tract_ids[0] not in prompt
