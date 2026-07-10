import sys
import unittest
from unittest.mock import MagicMock, patch
import os

# Adjust path to import app modules
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.config import settings
from app.engine.agent import AgentEngine
from app.vector.chroma_store import ChromaStore

class TestAMDGemmaIntegration(unittest.TestCase):
    def setUp(self):
        self.db_mock = MagicMock()
        # Mock settings key for fallback tests
        settings.GEMINI_API_KEY = "mock_gemini_key"
        settings.CUSTOM_LLM_BASE_URL = "http://mock-local-server:11434/v1"

    @patch('app.engine.agent.genai.Client')
    def test_vision_ocr_fallback(self, mock_genai_client_class):
        """
        Verify that if the provider is custom (AMD local) and image data is uploaded,
        the agent falls back to Gemini for the vision OCR phase if a Gemini key is configured.
        """
        mock_client = MagicMock()
        mock_genai_client_class.return_value = mock_client
        mock_client.models.generate_content.return_value = MagicMock(text="Extracted Image Error Code: 404")

        engine = AgentEngine(self.db_mock)
        
        # We mock _generate_llm_content to verify that it routes correctly
        original_generate = engine._generate_llm_content
        engine._generate_llm_content = MagicMock(return_value="Extracted Image Error Code: 404")
        
        # Mock DB connection details retrieval
        engine.db.query().filter().first.return_value = None 
        
        # Trigger query with image data
        # We pass provider="custom" and a dummy API key
        engine.execute_inquiry(
            company_id="company-123",
            query="Why did my transfer fail?",
            jwt_claims={"user_id": 852, "tenant_id": 1},
            api_key="noop",
            provider="custom",
            model_name="gemma4",
            image_data="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        # Verify that _generate_llm_content was called for OCR with ocr_provider="gemini"
        engine._generate_llm_content.assert_any_call(
            "gemini", 
            "gemini-2.5-flash", 
            "mock_gemini_key", 
            unittest.mock.ANY, 
            image_data=unittest.mock.ANY
        )

    @patch('app.vector.chroma_store.genai.Client')
    @patch('openai.OpenAI')
    @patch('app.vector.chroma_store.chromadb.PersistentClient')
    def test_embedding_fallback(self, mock_chroma_client, mock_openai_class, mock_genai_client_class):
        """
        Verify that if local nomic-embed-text fails (e.g. connection error),
        the ChromaStore falls back to Gemini embeddings if the Gemini key is present.
        """
        # Mock OpenAI to throw a connection error
        mock_openai_client = MagicMock()
        mock_openai_client.embeddings.create.side_effect = Exception("Connection refused")
        mock_openai_class.return_value = mock_openai_client

        # Mock Gemini client
        mock_gemini_client = MagicMock()
        mock_gemini_client.models.embed_content.return_value = MagicMock(
            embeddings=[MagicMock(values=[0.1, 0.2, 0.3])]
        )
        mock_genai_client_class.return_value = mock_gemini_client

        # Initialize ChromaStore
        store = ChromaStore(persist_dir="mock_chroma_dir", repository_id="repo-123")
        
        # Call generate embeddings with "custom" provider
        embeddings = store._generate_embeddings(
            texts=["test chunk"],
            api_key="noop",
            provider="custom"
        )

        # Check that OpenAI was called first, failed, and then Gemini was called as fallback
        mock_openai_client.embeddings.create.assert_called_once()
        mock_gemini_client.models.embed_content.assert_called_once_with(
            model="gemini-embedding-001",
            contents=["test chunk"]
        )
        self.assertEqual(embeddings, [[0.1, 0.2, 0.3]])

if __name__ == "__main__":
    unittest.main()
