"""
Model Context Protocol (MCP) & Tool Registry Layer for ZeroTicket.
Provides standard OpenAPI / MCP compatible JSON Schemas for ZeroTicket's tools
and a safe execution handler for agentic tool calls.
"""

from typing import Any, Dict, List

# Standard MCP / Function Tool Schemas
ZERO_TICKET_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "search_user_manuals",
        "description": "Searches Markdown documentation, user manuals, and FAQs indexed in ChromaDB.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language query or keywords describing the documentation topic to search."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "search_codebase_ast",
        "description": "Searches routes, controllers, middleware, and database models in the codebase syntax tree graph.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Function name, route path, controller action, or code logic keywords to search."
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "query_database_replica",
        "description": "Executes a read-only SELECT query against the production DB replica, protected by SQL Security Guard.",
        "parameters": {
            "type": "object",
            "properties": {
                "sql_query": {
                    "type": "string",
                    "description": "Read-only SQL SELECT statement to execute."
                }
            },
            "required": ["sql_query"]
        }
    },
    {
        "name": "parse_server_logs",
        "description": "Searches recent live server logs for error stack traces or timestamped user activity.",
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "Keyword, user ID, tenant ID, or timestamp to search within server log files."
                }
            },
            "required": ["keyword"]
        }
    }
]


class MCPToolDispatcher:
    def __init__(self, agent_engine):
        self.agent = agent_engine

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        return ZERO_TICKET_TOOLS

    def execute_tool(self, tool_name: str, arguments: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a registered ZeroTicket MCP tool within JWT security context.
        """
        company_id = context.get("company_id", "")
        repository_id = context.get("repository_id", "")
        jwt_claims = context.get("jwt_claims", {})
        api_key = context.get("api_key", "")
        provider = context.get("provider", "gemini")

        if tool_name == "search_user_manuals":
            query = arguments.get("query", "")
            results = self.agent.chroma.query_similar_code(query, limit=5, api_key=api_key, provider=provider)
            doc_chunks = [
                {
                    "file_path": r['metadata']['file_path'],
                    "section": r['metadata']['name'],
                    "lines": f"{r['metadata']['start_line']}-{r['metadata']['end_line']}",
                    "content": r['document']
                }
                for r in results if r['metadata'].get('chunk_type') == 'documentation'
            ]
            return {"status": "success", "results": doc_chunks}

        elif tool_name == "search_codebase_ast":
            query = arguments.get("query", "")
            results = self.agent.chroma.query_similar_code(query, limit=5, api_key=api_key, provider=provider)
            code_chunks = [
                {
                    "file_path": r['metadata']['file_path'],
                    "symbol": r['metadata']['name'],
                    "lines": f"{r['metadata']['start_line']}-{r['metadata']['end_line']}",
                    "content": r['document']
                }
                for r in results if r['metadata'].get('chunk_type') != 'documentation'
            ]
            return {"status": "success", "results": code_chunks}

        elif tool_name == "parse_server_logs":
            keyword = arguments.get("keyword", "")
            log_context, _ = self.agent._get_live_logs(company_id, repository_id, jwt_claims, query=keyword)
            return {"status": "success", "logs": log_context}

        else:
            return {"status": "error", "message": f"Unknown tool: {tool_name}"}
