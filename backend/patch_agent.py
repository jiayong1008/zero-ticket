import re
import json
import time

def read_file(path):
    with open(path, "r") as f:
        return f.read()

content = read_file("backend/app/engine/agent.py")

# Ensure execute_inquiry_stream doesn't already exist
if "def execute_inquiry_stream" not in content:
    new_method = """
    def execute_inquiry_stream(self, company_id: str, query: str, jwt_claims: dict, api_key: str = "", repository_id: str = "", provider: str = "gemini", model_name: str = "", chat_history: list = None, image_data: str = None):
        import json
        
        def yield_event(event_type: str, content_data: str):
            payload = json.dumps({"type": event_type, "content": content_data})
            return f"data: {payload}\\n\\n"

        start_time = time.time()
        
        # 0. Resolve LLM Configuration
        if not api_key:
            from app.db import Company, decrypt_password
            company = self.db.query(Company).filter(Company.id == company_id).first()
            if company and company.encrypted_llm_api_key:
                api_key = decrypt_password(company.encrypted_llm_api_key)
                provider = company.llm_provider or provider
                model_name = company.llm_model or model_name
        
        if not api_key:
            yield yield_event("error", "Error: Failed to generate SQL draft using LLM: LLM API Key is not configured.")
            return

        # 0.5 Preprocess Image OCR if image_data exists
        if image_data:
            yield yield_event("thought", "--- [Image OCR Extraction] ---\\nExtracting text from image...\\n")
            ocr_prompt = f"Analyze this image in the context of the user's inquiry: '{query}'. Extract any visible text, error messages, IDs, or relevant UI state that might be useful for a database lookup. Keep it concise."
            try:
                extracted_text = self._generate_llm_content(provider, model_name, api_key, ocr_prompt, image_data=image_data)
                query = f"{query}\\n\\n[Extracted Image Context]: {extracted_text}"
                yield yield_event("thought", f"Extracted text:\\n{extracted_text}\\n\\n")
            except Exception as e:
                yield yield_event("thought", f"Failed to extract image text: {str(e)}\\n\\n")
            
        # 1. Fetch DB Connection details
        conn_details = None
        if repository_id:
            conn_details = self.db.query(DBConnection).filter(DBConnection.repository_id == repository_id).first()
        if not conn_details:
            conn_details = self.db.query(DBConnection).filter(DBConnection.company_id == company_id).first()
            
        if not conn_details:
            yield yield_event("error", "Error: No target database connection configured.")
            return

        db_type = getattr(conn_details, "db_type", "mysql") or "mysql"

        # 2. Extract database schema
        schema_extractor = None
        target_conn = None
        try:
            target_conn = get_target_db_conn(conn_details)
            schema_extractor = SchemaExtractor(target_conn)
            db_schema = schema_extractor.extract_schema(conn_details.db_name)
            schema_context = schema_extractor.format_schema_for_llm(db_schema)
        except Exception as e:
            yield yield_event("error", f"Error: Failed to connect or inspect target database schema. Detail: {str(e)}")
            return
        finally:
            if target_conn:
                target_conn.close()

        # 3. Retrieve relevant codebase chunks from Chroma
        if repository_id and repository_id != self._repository_id:
            from app.vector.chroma_store import ChromaStore as _CS
            chroma = _CS(persist_dir="chroma_db", repository_id=repository_id)
        else:
            chroma = self.chroma
        code_snippets = []
        code_context = ""
        try:
            results = chroma.query_similar_code(query, limit=5, api_key=api_key, provider=provider)
            for res in results:
                meta = res['metadata']
                code_snippets.append({
                    "file_path": meta['file_path'],
                    "lines": f"{meta['start_line']}-{meta['end_line']}",
                    "name": meta['name'],
                    "content": res['document']
                })
            
            code_context = "\\n\\n".join([
                f"### File: {s['file_path']} (Lines {s['lines']}, function/class: {s['name']})\\n```\\n{s['content']}\\n```" 
                for s in code_snippets
            ])
            yield yield_event("thought", "--- [Retrieved Code Snippets] ---\\n")
            yield yield_event("thought", code_context + "\\n\\n")
        except Exception as e:
            code_context = "No codebase context retrieved."
            yield yield_event("thought", "--- [Codebase Search Failed] ---\\n" + str(e) + "\\n\\n")

        yield yield_event("thought", "--- [DB Schema] ---\\n")
        yield yield_event("thought", schema_context + "\\n\\n")

        # 4. Format chat history
        history_context = ""
        if chat_history:
            history_lines = []
            char_count = 0
            for msg in reversed(chat_history):
                role_str = "ZeroTicket" if msg.get("role") == "assistant" else "User"
                line = f"[{role_str}]: {msg.get('content', '')}"
                if char_count + len(line) > 3000:
                    break
                history_lines.insert(0, line)
                char_count += len(line)
            if history_lines:
                history_context = "RECENT CONVERSATION HISTORY:\\n" + "\\n".join(history_lines) + "\\n"

        # 5. Draft SQL Query
        sql_draft_prompt = f\"\"\"
You are the database inspection unit of ZeroTicket.
Your job is to write a single read-only {db_type.upper()} SELECT query that will extract the database state needed to answer the user's inquiry.

DATABASE SCHEMA:
{schema_context}

{history_context}
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
\"\"\"
        yield yield_event("thought", "--- [LLM Drafted SQL] ---\\n")
        
        draft_sql = ""
        sql_text = ""
        try:
            for chunk in self._generate_llm_content(provider, model_name, api_key, sql_draft_prompt, stream=True):
                sql_text += chunk
                yield yield_event("thought", chunk)
            
            yield yield_event("thought", "\\n\\n")
            
            sql_match = re.search(r"```sql(.*?)```", sql_text, re.DOTALL | re.IGNORECASE)
            if sql_match:
                draft_sql = sql_match.group(1).strip()
            else:
                draft_sql = sql_text.strip()
        except Exception as e:
            yield yield_event("error", f"Error: Failed to generate SQL draft using LLM: {str(e)}")
            return

        # 5. Rewrite/Sanitize Query with SQLSecurityGuard
        sanitized_sql = ""
        db_rows = []
        execution_time_ms = 0
        
        try:
            guard = SQLSecurityGuard(db_schema, dialect=db_type)
            sanitized_sql = guard.validate_and_rewrite(draft_sql, jwt_claims)
            yield yield_event("thought", f"--- [Security Guard Sanitized SQL] ---\\n{sanitized_sql}\\n\\n")
            
            # 6. Execute SQL query on target replica
            db_start = time.time()
            target_conn = get_target_db_conn(conn_details)
            with target_conn.cursor() as cursor:
                if db_type in ["postgres", "postgresql"]:
                    cursor.execute("SET statement_timeout = 500")
                else:
                    cursor.execute("SET max_execution_time = 500")
                cursor.execute(sanitized_sql)
                db_rows = cursor.fetchall()
            target_conn.close()
            execution_time_ms = int((time.time() - db_start) * 1000)
            
            yield yield_event("thought", f"--- [Database Query Results] (Time: {execution_time_ms}ms) ---\\n{str(db_rows)}\\n\\n")
        except Exception as e:
            yield yield_event("thought", f"--- [SQL Execution/Security Error] ---\\n{str(e)}\\n\\n")
            db_rows = [{"error": str(e)}]

        # 7. Synthesize Response
        synthesis_prompt = f\"\"\"
You are ZeroTicket, the AI support assistant. 
Your goal is to answer the customer's support inquiry in a helpful, non-technical way.

{history_context}
CODE LOGIC EXPLAINER:
{code_context}

USER INQUIRY:
"{query}"

JWT CLAIMS FOR LOGGED IN USER:
{str(jwt_claims)}

SQL QUERY EXECUTED:
{sanitized_sql or "No query executed"}

DATABASE STATE RETRIEVED:
{str(db_rows)}

INSTRUCTIONS:
1. Address the customer directly and explain their situation clearly in simple English.
2. Avoid raw developer terms, SQL queries, column names, or raw JSON states in your final reply. For example, do not say "The invoice table has status = 2", instead say "Your invoice is currently in pending state".
3. Use the retrieved codebase rules to justify the explanation. (e.g. "According to our policy, standard ACH payments take up to 2 working days to settle").
4. If there was a database error or no data found, politely explain that you cannot locate the record or verify the state, and suggest what they can check or how to contact support.
\"\"\"
        
        try:
            for chunk in self._generate_llm_content(provider, model_name, api_key, synthesis_prompt, stream=True):
                yield yield_event("answer", chunk)
        except Exception as e:
            yield yield_event("error", f"Error: Failed to synthesize response. Detail: {str(e)}")

        total_time_ms = int((time.time() - start_time) * 1000)
        yield yield_event("thought", f"--- [Total Processing Time] ---\\n{total_time_ms}ms\\n")
"""
    # Append the new method to the end of the class
    with open("backend/app/engine/agent.py", "w") as f:
        f.write(content + "\n" + new_method)
