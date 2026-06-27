import uuid
import secrets
from fastapi import FastAPI, Depends, HTTPException, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db import (
    init_db, get_db, Company, Repository, DBConnection, 
    ChatSession, ChatMessage, encrypt_password, decrypt_password
)
from app.auth import verify_jwt_token
from app.parser.code_parser import CodeParser
from app.parser.schema_extractor import SchemaExtractor
from app.vector.chroma_store import ChromaStore
from app.engine.agent import AgentEngine

app = FastAPI(title="ZeroTicket API Engine", version="1.0.0")

# Enable CORS for Next.js dev server and widget embedding
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()

# Pydantic Schemas for Requests/Responses
class CompanyCreate(BaseModel):
    name: str

class RepositoryConnect(BaseModel):
    company_id: str
    repo_path: str  # local folder path for this developer tool
    branch: Optional[str] = "main"

class DBConnectRequest(BaseModel):
    company_id: str
    db_host: str
    db_port: int = 3306
    db_user: str
    db_pass: str
    db_name: str

class ChatMessageRequest(BaseModel):
    session_id: str
    message: str

class SandboxRequest(BaseModel):
    company_id: str
    query: str
    mock_claims: dict
    gemini_api_key: Optional[str] = ""

# API Endpoints

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "ZeroTicket Engine"}

@app.post("/api/company/register")
def register_company(data: CompanyCreate, db: Session = Depends(get_db)):
    company_id = str(uuid.uuid4())
    # Generate API key
    raw_api_key = f"zt_{secrets.token_hex(20)}"
    # Encrypt the API key for secure verification later
    encrypted_key = encrypt_password(raw_api_key)
    
    company = Company(
        id=company_id,
        name=data.name,
        api_key_hash=encrypted_key  # Using api_key_hash column to store the encrypted key
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    
    return {
        "company_id": company.id,
        "name": company.name,
        "api_key": raw_api_key
    }

@app.post("/api/repository/connect")
def connect_repository(data: RepositoryConnect, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    repo_id = str(uuid.uuid4())
    repo = Repository(
        id=repo_id,
        company_id=data.company_id,
        provider="github",  # Local repo maps to github-like scanning
        repo_name=data.repo_path,
        branch=data.branch,
        sync_status="pending"
    )
    
    # Delete existing repository settings for the company
    db.query(Repository).filter(Repository.company_id == data.company_id).delete()
    
    db.add(repo)
    db.commit()
    db.refresh(repo)
    
    return {"status": "connected", "repository_id": repo.id, "sync_status": repo.sync_status}

@app.post("/api/db/connect")
def connect_db(data: DBConnectRequest, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    encrypted_pass = encrypt_password(data.db_pass)
    
    conn = DBConnection(
        id=str(uuid.uuid4()),
        company_id=data.company_id,
        db_host=data.db_host,
        db_port=data.db_port,
        db_user=data.db_user,
        encrypted_db_pass=encrypted_pass,
        db_name=data.db_name
    )
    
    # Delete existing DB Connection for the company
    db.query(DBConnection).filter(DBConnection.company_id == data.company_id).delete()
    
    db.add(conn)
    db.commit()
    db.refresh(conn)
    
    return {"status": "connected", "connection_id": conn.id}

def start_ingestion_task(company_id: str, gemini_api_key: str, db_session_factory):
    # We open a new database session in the background task to avoid session thread sharing issues
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.company_id == company_id).first()
        conn_details = db.query(DBConnection).filter(DBConnection.company_id == company_id).first()
        if not repo or not conn_details:
            return
            
        # Step 1: Scan and Parse Codebase
        repo.sync_status = "parsing"
        db.commit()
        parser = CodeParser(repo.repo_name)
        chunks = parser.scan_repository()
        
        # Step 2: Index Code Chunks in Vector DB
        chroma = ChromaStore(persist_dir="chroma_db")
        chroma.add_code_chunks(chunks, api_key=gemini_api_key)
        
        # Step 3: Verify target DB schema can be queried
        from app.db import get_target_db_conn
        target_conn = get_target_db_conn(conn_details)
        schema_extractor = SchemaExtractor(target_conn)
        _ = schema_extractor.extract_schema(conn_details.db_name)
        target_conn.close()
        
        repo.sync_status = "linked"
        import time
        repo.last_synced_at = int(time.time())
        db.commit()
    except Exception as e:
        import traceback
        with open("ingestion_error.log", "w") as f:
            traceback.print_exc(file=f)
        repo.sync_status = "failed"
        db.commit()
    finally:
        db.close()

@app.post("/api/ingest")
def run_ingestion(
    company_id: str, 
    background_tasks: BackgroundTasks, 
    gemini_api_key: Optional[str] = "", 
    db: Session = Depends(get_db)
):
    repo = db.query(Repository).filter(Repository.company_id == company_id).first()
    conn_details = db.query(DBConnection).filter(DBConnection.company_id == company_id).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail="No repository configured.")
    if not conn_details:
        raise HTTPException(status_code=404, detail="No target database configured.")
        
    repo.sync_status = "cloning"
    db.commit()
    
    # Start ingestion task in background
    background_tasks.add_task(start_ingestion_task, company_id, gemini_api_key, None)
    
    return {
        "status": "success", 
        "code_chunks_indexed": 0,
        "sync_status": "cloning"
    }

@app.post("/api/chat/session")
def create_chat_session(jwt_claims: dict = Depends(verify_jwt_token), db: Session = Depends(get_db)):
    """
    Creates an authenticated chat session.
    The issuer/company ID is verified via JWT token signature.
    """
    company_id = jwt_claims.get("company_id") or jwt_claims.get("iss")
    ext_user_id = jwt_claims.get("user_id")
    ext_tenant_id = jwt_claims.get("tenant_id")
    
    session_id = str(uuid.uuid4())
    session = ChatSession(
        id=session_id,
        company_id=company_id,
        external_user_id=ext_user_id,
        external_tenant_id=ext_tenant_id
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return {"session_id": session.id}

@app.post("/api/chat/send")
def send_chat_message(
    data: ChatMessageRequest, 
    jwt_claims: dict = Depends(verify_jwt_token), 
    db: Session = Depends(get_db)
):
    """
    Sends a message to the AI agent inside an authenticated chat session.
    """
    session = db.query(ChatSession).filter(ChatSession.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    company_id = jwt_claims.get("company_id") or jwt_claims.get("iss")
    if session.company_id != company_id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
        
    # Save User message
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        sender="user",
        content=data.message
    )
    db.add(user_msg)
    db.commit()
    
    # Run Agent Engine execution
    engine = AgentEngine(db)
    # Check if header contains API Key for Gemini bypass or use system setting
    result = engine.execute_inquiry(
        company_id=company_id,
        query=data.message,
        jwt_claims=jwt_claims
    )
    
    # Save Assistant message
    assistant_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        sender="assistant",
        content=result["answer"],
        internal_thought_log=result["thought_log"]
    )
    db.add(assistant_msg)
    db.commit()
    
    return {
        "answer": result["answer"],
        "thought_log": result["thought_log"]
    }

@app.post("/api/sandbox/simulate")
def simulate_sandbox(data: SandboxRequest, db: Session = Depends(get_db)):
    """
    Developer playground endpoint to simulate queries and inspect thought logs.
    No JWT signature verification needed, allowing quick local emulation.
    """
    engine = AgentEngine(db)
    result = engine.execute_inquiry(
        company_id=data.company_id,
        query=data.query,
        jwt_claims=data.mock_claims,
        api_key=data.gemini_api_key
    )
    return result
