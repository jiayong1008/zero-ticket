import time
import re
from google import genai
from app.config import settings
from app.db import DBConnection, get_target_db_conn
from app.parser.schema_extractor import SchemaExtractor
from app.vector.chroma_store import ChromaStore
from app.engine.security import SQLSecurityGuard

class AgentEngine:
    def __init__(self, db_session):
        self.db = db_session
        self.chroma = ChromaStore(persist_dir="chroma_db")

    def _get_gemini_client(self, api_key: str = ""):
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY is not configured.")
        return genai.Client(api_key=key)

    def execute_inquiry(self, company_id: str, query: str, jwt_claims: dict, api_key: str = "") -> dict:
        """
        Coordinates the full execution loop:
        1. Retrieves relevant codebase context from Chroma.
        2. Retrieves MySQL DB schema definition and sample data.
        3. Invokes LLM to draft a database query.
        4. Rewrites the query using SQLSecurityGuard (enforcing tenant rules).
        5. Executes the query against target MySQL.
        6. Invokes LLM to formulate the final explanation.
        """
        start_time = time.time()
        
        # 1. Fetch Company target DB Connection details
        conn_details = self.db.query(DBConnection).filter(DBConnection.company_id == company_id).first()
        if not conn_details:
            return {
                "answer": "Error: No target database connection configured. Please set this up in the developer dashboard.",
                "thought_log": "No DB connection configured."
            }

        # 2. Extract database schema
        schema_extractor = None
        target_conn = None
        try:
            target_conn = get_target_db_conn(conn_details)
            schema_extractor = SchemaExtractor(target_conn)
            db_schema = schema_extractor.extract_schema(conn_details.db_name)
            schema_context = schema_extractor.format_schema_for_llm(db_schema)
        except Exception as e:
            return {
                "answer": f"Error: Failed to connect or inspect target database schema. Detail: {str(e)}",
                "thought_log": f"Failed target DB setup: {str(e)}"
            }
        finally:
            if target_conn:
                target_conn.close()

        # 3. Retrieve relevant codebase chunks from Chroma
        code_snippets = []
        code_context = ""
        try:
            results = self.chroma.query_similar_code(query, limit=5, api_key=api_key)
            for res in results:
                meta = res['metadata']
                code_snippets.append({
                    "file_path": meta['file_path'],
                    "lines": f"{meta['start_line']}-{meta['end_line']}",
                    "name": meta['name'],
                    "content": res['document']
                })
            
            code_context = "\n\n".join([
                f"### File: {s['file_path']} (Lines {s['lines']}, function/class: {s['name']})\n```\n{s['content']}\n```" 
                for s in code_snippets
            ])
        except Exception as e:
            # Continue even if codebase search fails, but document it in thought logs
            print(f"Codebase search skipped/failed: {str(e)}")
            code_context = "No codebase context retrieved."

        # 4. Draft SQL Query
        draft_sql = ""
        client = self._get_gemini_client(api_key)
        
        sql_draft_prompt = f"""
You are the database inspection unit of ZeroTicket.
Your job is to write a single read-only MySQL SELECT query that will extract the database state needed to answer the user's inquiry.

DATABASE SCHEMA:
{schema_context}

RELEVANT CODE LOGIC:
{code_context}

USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

INSTRUCTIONS:
1. Write a SELECT statement to query tables.
2. Ensure you filter rows correctly using the columns. Do NOT worry about injecting security tenant filters yourself—our middleware security rewriter will automatically inject subqueries with WHERE statements for columns like `tenant_id` or `user_id`. But feel free to filter by appropriate keys if you know them.
3. Keep the query simple and efficient.
4. Output ONLY the raw SQL query inside a single ```sql ... ``` block. Do NOT write any conversational text or explanation.
"""
        thought_log = []
        thought_log.append("--- [Retrieved Code Snippets] ---")
        thought_log.append(code_context)
        thought_log.append("\n--- [DB Schema] ---")
        thought_log.append(schema_context)

        try:
            sql_response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=sql_draft_prompt
            )
            sql_text = sql_response.text or ""
            
            # Extract query from markdown code block
            sql_match = re.search(r"```sql(.*?)```", sql_text, re.DOTALL | re.IGNORECASE)
            if sql_match:
                draft_sql = sql_match.group(1).strip()
            else:
                draft_sql = sql_text.strip()
                
            thought_log.append(f"\n--- [LLM Drafted SQL] ---\n{draft_sql}")
        except Exception as e:
            return {
                "answer": f"Error: Failed to generate SQL draft using LLM: {str(e)}",
                "thought_log": "\n".join(thought_log) + f"\nError generating SQL: {str(e)}"
            }

        # 5. Rewrite/Sanitize Query with SQLSecurityGuard
        sanitized_sql = ""
        db_rows = []
        execution_time_ms = 0
        
        try:
            guard = SQLSecurityGuard(db_schema)
            sanitized_sql = guard.validate_and_rewrite(draft_sql, jwt_claims)
            thought_log.append(f"\n--- [Security Guard Sanitized SQL] ---\n{sanitized_sql}")
            
            # 6. Execute SQL query on target replica
            db_start = time.time()
            target_conn = get_target_db_conn(conn_details)
            with target_conn.cursor() as cursor:
                # Set session timeout of 500ms (0.5s)
                cursor.execute("SET max_execution_time = 500")
                cursor.execute(sanitized_sql)
                db_rows = cursor.fetchall()
            target_conn.close()
            execution_time_ms = int((time.time() - db_start) * 1000)
            
            thought_log.append(f"\n--- [Database Query Results] (Time: {execution_time_ms}ms) ---\n{str(db_rows)}")
        except Exception as e:
            # If query fails, we continue but explain to LLM that SQL failed
            thought_log.append(f"\n--- [SQL Execution/Security Error] ---\n{str(e)}")
            db_rows = [{"error": str(e)}]

        # 7. Synthesize Response
        synthesis_prompt = f"""
You are ZeroTicket, the AI support assistant. 
Your goal is to answer the customer's support inquiry in a helpful, non-technical way.

USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

CODE LOGIC EXPLAINER:
{code_context}

SQL QUERY EXECUTED:
{sanitized_sql or "No query executed"}

DATABASE STATE RETRIEVED:
{str(db_rows)}

INSTRUCTIONS:
1. Address the customer directly and explain their situation clearly in simple English.
2. Avoid raw developer terms, SQL queries, column names, or raw JSON states in your final reply. For example, do not say "The invoice table has status = 2", instead say "Your invoice is currently in pending state".
3. Use the retrieved codebase rules to justify the explanation. (e.g. "According to our policy, standard ACH payments take up to 2 working days to settle").
4. If there was a database error or no data found, politely explain that you cannot locate the record or verify the state, and suggest what they can check or how to contact support.
"""
        
        try:
            final_response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=synthesis_prompt
            )
            answer = final_response.text or "I apologize, I could not synthesize an answer at this moment."
        except Exception as e:
            answer = f"Error: Failed to synthesize response. Detail: {str(e)}"
            thought_log.append(f"Failed response synthesis: {str(e)}")

        total_time_ms = int((time.time() - start_time) * 1000)
        thought_log.append(f"\n--- [Total Processing Time] ---\n{total_time_ms}ms")

        return {
            "answer": answer,
            "thought_log": "\n".join(thought_log)
        }
