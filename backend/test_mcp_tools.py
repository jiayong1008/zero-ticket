import unittest
from unittest.mock import MagicMock
from app.engine.mcp_tools import MCPToolDispatcher, ZERO_TICKET_TOOLS

class TestMCPTools(unittest.TestCase):

    def test_tool_schemas(self):
        tool_names = [t['name'] for t in ZERO_TICKET_TOOLS]
        self.assertIn("search_user_manuals", tool_names)
        self.assertIn("search_codebase_ast", tool_names)
        self.assertIn("query_database_replica", tool_names)
        self.assertIn("parse_server_logs", tool_names)

    def test_dispatcher_execution(self):
        mock_agent = MagicMock()
        mock_agent.chroma.query_similar_code.return_value = [
            {
                "metadata": {
                    "file_path": "docs/MANUAL.md",
                    "name": "doc::Setup",
                    "start_line": 1,
                    "end_line": 20,
                    "chunk_type": "documentation"
                },
                "document": "Setup instructions..."
            }
        ]
        
        dispatcher = MCPToolDispatcher(mock_agent)
        res = dispatcher.execute_tool(
            "search_user_manuals",
            {"query": "setup"},
            {"company_id": "c1", "repository_id": "r1"}
        )
        self.assertEqual(res["status"], "success")
        self.assertEqual(len(res["results"]), 1)
        self.assertEqual(res["results"][0]["file_path"], "docs/MANUAL.md")

if __name__ == "__main__":
    unittest.main()
