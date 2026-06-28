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
    # Reset stuck repositories to pending on startup
    from app.db import SessionLocal, Repository
    db = SessionLocal()
    try:
        stuck_repos = db.query(Repository).filter(Repository.sync_status.in_(["cloning", "parsing"])).all()
        if stuck_repos:
            print(f"[startup] Resetting {len(stuck_repos)} stuck repositories from cloning/parsing to pending...")
            for r in stuck_repos:
                r.sync_status = "pending"
            db.commit()
    except Exception as e:
        print(f"[startup] Failed to reset stuck repos: {e}")
    finally:
        db.close()

# Pydantic Schemas for Requests/Responses
class CompanyCreate(BaseModel):
    name: str

class RepositoryConnect(BaseModel):
    company_id: str
    repo_path: str  # local folder path for this developer tool
    branch: Optional[str] = "main"
    project_name: Optional[str] = None

class DBConnectRequest(BaseModel):
    company_id: str
    repository_id: Optional[str] = None  # Link DB to a specific Repository project!
    db_type: Optional[str] = "mysql"     # 'mysql' or 'postgres'
    db_host: str
    db_port: int = 3306
    db_user: str
    db_pass: str
    db_name: str

class IngestRequest(BaseModel):
    company_id: str
    repository_id: Optional[str] = None
    llm_provider: Optional[str] = "gemini"
    api_key: Optional[str] = ""

class ChatMessageRequest(BaseModel):
    session_id: str
    message: str

class SandboxRequest(BaseModel):
    company_id: str
    repository_id: Optional[str] = None
    query: str
    mock_claims: dict
    llm_provider: Optional[str] = "gemini"
    llm_model: Optional[str] = ""
    api_key: Optional[str] = ""

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
        
    repo = db.query(Repository).filter(
        Repository.company_id == data.company_id,
        Repository.repo_name == data.repo_path
    ).first()
    
    name = data.project_name or data.repo_path.split("/")[-1] or data.repo_path.split("\\")[-1] or "New Project"
    
    if not repo:
        repo_id = str(uuid.uuid4())
        repo = Repository(
            id=repo_id,
            company_id=data.company_id,
            project_name=name,
            provider="github",
            repo_name=data.repo_path,
            branch=data.branch,
            sync_status="pending"
        )
        db.add(repo)
    else:
        repo.project_name = name
        repo.branch = data.branch
        repo.sync_status = "pending"
        
    db.commit()
    db.refresh(repo)
    
    return {"status": "connected", "repository_id": repo.id, "sync_status": repo.sync_status}

@app.post("/api/db/connect")
def connect_db(data: DBConnectRequest, db: Session = Depends(get_db)):
    company = db.query(Company).filter(Company.id == data.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    encrypted_pass = encrypt_password(data.db_pass)
    
    # Check if there is an existing DB connection for this repository
    conn = None
    if data.repository_id:
        conn = db.query(DBConnection).filter(DBConnection.repository_id == data.repository_id).first()
        
    if not conn:
        conn = DBConnection(
            id=str(uuid.uuid4()),
            company_id=data.company_id,
            repository_id=data.repository_id,
            db_type=data.db_type or "mysql",
            db_host=data.db_host,
            db_port=data.db_port,
            db_user=data.db_user,
            encrypted_db_pass=encrypted_pass,
            db_name=data.db_name
        )
        db.add(conn)
    else:
        conn.db_type = data.db_type or "mysql"
        conn.db_host = data.db_host
        conn.db_port = data.db_port
        conn.db_user = data.db_user
        conn.encrypted_db_pass = encrypted_pass
        conn.db_name = data.db_name
        
    db.commit()
    db.refresh(conn)
    
    return {"status": "connected", "connection_id": conn.id}

def start_ingestion_task(company_id: str, repository_id: str, api_key: str, provider: str, db_session_factory):
    # We open a new database session in the background task to avoid session thread sharing issues
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repository_id).first()
        if not repo:
            repo = db.query(Repository).filter(Repository.company_id == company_id).first()
        if not repo:
            return
            
        conn_details = db.query(DBConnection).filter(DBConnection.repository_id == repo.id).first()
        if not conn_details:
            conn_details = db.query(DBConnection).filter(DBConnection.company_id == company_id).first()
        # conn_details may be None for code-only projects — that's fine, we skip DB schema verification.
            
        # Step 1: Scan and Parse Codebase
        repo.sync_status = "parsing"
        db.commit()
        parser = CodeParser(repo.repo_name)
        chunks = parser.scan_repository()
        
        repo.chunks_total = len(chunks)
        repo.chunks_indexed = 0
        db.commit()
        
        # Step 2: Index Code Chunks in Vector DB using selected provider
        chroma = ChromaStore(persist_dir="chroma_db", repository_id=repo.id)
        
        def update_progress(indexed_count, status_msg=None):
            try:
                # Refresh session and update repo columns
                db.expire_all()
                r = db.query(Repository).filter(Repository.id == repo.id).first()
                if r:
                    r.chunks_indexed = min(indexed_count, len(chunks))
                    r.sync_message = status_msg
                    db.commit()
            except Exception:
                pass

        chroma.add_code_chunks(chunks, api_key=api_key, provider=provider, on_progress=update_progress)
        
        # Step 3: Verify target DB schema (skip if no DB is connected for this project)
        if conn_details:
            from app.db import get_target_db_conn
            target_conn = get_target_db_conn(conn_details)
            schema_extractor = SchemaExtractor(target_conn)
            _ = schema_extractor.extract_schema(conn_details.db_name)
            target_conn.close()
        
        # Ingestion complete - clear sync message
        repo.sync_status = "linked"
        repo.sync_message = None
        import time
        repo.last_synced_at = int(time.time())
        db.commit()
    except Exception as e:
        import traceback
        with open("ingestion_error.log", "w") as f:
            traceback.print_exc(file=f)
        if repo:
            repo.sync_status = "failed"
            repo.sync_message = str(e)
            db.commit()
    finally:
        _ingestion_in_progress.discard(repository_id)
        db.close()

# Track which repos are currently being ingested to prevent duplicate background tasks
_ingestion_in_progress: set = set()

@app.post("/api/ingest")
def run_ingestion(
    data: IngestRequest,
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    repo = db.query(Repository).filter(Repository.id == data.repository_id).first()
    if not repo:
        repo = db.query(Repository).filter(Repository.company_id == data.company_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="No repository configured.")
        
    # conn_details may be None for code-only projects — ingest proceeds without DB schema verification
    conn_details = db.query(DBConnection).filter(DBConnection.repository_id == repo.id).first()
    if not conn_details:
        conn_details = db.query(DBConnection).filter(DBConnection.company_id == data.company_id).first()

    # Guard: reject if already syncing this repo
    if repo.id in _ingestion_in_progress:
        raise HTTPException(status_code=409, detail="Sync already in progress for this project. Please wait for it to complete.")

    repo.sync_status = "cloning"
    db.commit()
    _ingestion_in_progress.add(repo.id)
    
    # Start ingestion task in background
    background_tasks.add_task(
        start_ingestion_task, 
        data.company_id, 
        repo.id, 
        data.api_key, 
        data.llm_provider or "gemini", 
        None
    )
    
    return {
        "status": "success", 
        "code_chunks_indexed": 0,
        "sync_status": "cloning"
    }

@app.get("/api/company/projects")
def get_company_projects(company_id: str, db: Session = Depends(get_db)):
    projects = db.query(Repository).filter(Repository.company_id == company_id).all()
    result = []
    for proj in projects:
        db_conn = db.query(DBConnection).filter(DBConnection.repository_id == proj.id).first()
        result.append({
            "repository_id": proj.id,
            "project_name": proj.project_name or proj.repo_name.split("/")[-1],
            "repo_path": proj.repo_name,
            "branch": proj.branch,
            "sync_status": proj.sync_status,
            "last_synced_at": proj.last_synced_at,
            "db_connected": db_conn is not None,
            "db_type": db_conn.db_type if db_conn else None,
            "db_name": db_conn.db_name if db_conn else None,
            "chunks_total": proj.chunks_total or 0,
            "chunks_indexed": proj.chunks_indexed or 0
        })
    return result

@app.post("/api/chat/session")
def create_chat_session(jwt_claims: dict = Depends(verify_jwt_token), db: Session = Depends(get_db)):
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
    session = db.query(ChatSession).filter(ChatSession.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    company_id = jwt_claims.get("company_id") or jwt_claims.get("iss")
    if session.company_id != company_id:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
        
    user_msg = ChatMessage(
        id=str(uuid.uuid4()),
        session_id=session.id,
        sender="user",
        content=data.message
    )
    db.add(user_msg)
    db.commit()
    
    engine = AgentEngine(db)
    result = engine.execute_inquiry(
        company_id=company_id,
        query=data.message,
        jwt_claims=jwt_claims
    )
    
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
    engine = AgentEngine(db, repository_id=data.repository_id or "")
    result = engine.execute_inquiry(
        company_id=data.company_id,
        query=data.query,
        jwt_claims=data.mock_claims,
        api_key=data.api_key,
        repository_id=data.repository_id,
        provider=data.llm_provider or "gemini",
        model_name=data.llm_model
    )
    return result
