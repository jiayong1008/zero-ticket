import time
from sqlalchemy import create_engine, Column, String, Integer, Text, Enum, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from cryptography.fernet import Fernet
from app.config import settings
import pymysql

Base = declarative_base()

class Company(Base):
    __tablename__ = 'companies'
    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False)
    api_key_hash = Column(Text, nullable=False, unique=True)
    llm_provider = Column(String(50), nullable=True, default="gemini")
    encrypted_llm_api_key = Column(Text, nullable=True)
    llm_model = Column(String(100), nullable=True)
    llm_base_url = Column(String(255), nullable=True, default="")
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    repositories = relationship("Repository", back_populates="company", cascade="all, delete-orphan")
    db_connections = relationship("DBConnection", back_populates="company", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="company", cascade="all, delete-orphan")

class Repository(Base):
    __tablename__ = 'repositories'
    id = Column(String(36), primary_key=True)
    company_id = Column(String(36), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    project_name = Column(String(255), nullable=True)
    provider = Column(Enum('github', 'gitlab', 'bitbucket', name='provider_enum'), nullable=False, default='github')
    repo_name = Column(String(255), nullable=False)  # For local repos, this can be the folder path
    branch = Column(String(100), default='main')
    sync_status = Column(Enum('pending', 'cloning', 'parsing', 'linked', 'failed', name='sync_status_enum'), nullable=False, default='pending')
    last_synced_at = Column(Integer, nullable=True)
    chunks_total = Column(Integer, nullable=True, default=0)
    chunks_indexed = Column(Integer, nullable=True, default=0)
    sync_message = Column(Text, nullable=True)
    encrypted_github_token = Column(Text, nullable=True)
    
    company = relationship("Company", back_populates="repositories")
    db_connection = relationship("DBConnection", back_populates="repository", uselist=False, cascade="all, delete-orphan")
    onboarding_questions = relationship("OnboardingQuestion", back_populates="repository", cascade="all, delete-orphan")

    def set_github_token(self, token: str):
        if not token or not token.strip():
            self.encrypted_github_token = None
        else:
            self.encrypted_github_token = encrypt_password(token.strip())

    def get_github_token(self) -> str:
        if not self.encrypted_github_token:
            return None
        try:
            return decrypt_password(self.encrypted_github_token)
        except Exception:
            return None

class DBConnection(Base):
    __tablename__ = 'db_connections'
    id = Column(String(36), primary_key=True)
    company_id = Column(String(36), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    repository_id = Column(String(36), ForeignKey('repositories.id', ondelete='CASCADE'), nullable=True)
    db_type = Column(String(20), default='mysql')  # 'mysql' or 'postgres'
    db_host = Column(String(255), nullable=False)
    db_port = Column(Integer, default=3306)
    db_user = Column(String(100), nullable=False)
    encrypted_db_pass = Column(Text, nullable=False)
    db_name = Column(String(100), nullable=False)
    ssl_required = Column(Boolean, default=False)
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    company = relationship("Company", back_populates="db_connections")
    repository = relationship("Repository", back_populates="db_connection")

class ChatSession(Base):
    __tablename__ = 'chat_sessions'
    id = Column(String(36), primary_key=True)
    company_id = Column(String(36), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    external_user_id = Column(String(255), nullable=False)
    external_tenant_id = Column(String(255), nullable=True)
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    company = relationship("Company", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = 'chat_messages'
    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey('chat_sessions.id', ondelete='CASCADE'), nullable=False)
    sender = Column(Enum('user', 'assistant', 'system', name='sender_enum'), nullable=False)
    content = Column(Text, nullable=False)
    internal_thought_log = Column(Text, nullable=True)
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    session = relationship("ChatSession", back_populates="messages")


class OnboardingQuestion(Base):
    __tablename__ = 'onboarding_questions'
    id = Column(String(36), primary_key=True)
    repository_id = Column(String(36), ForeignKey('repositories.id', ondelete='CASCADE'), nullable=False)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=True)  # JSON-encoded array of options (strings) or empty for open-ended text input
    answer = Column(Text, nullable=True)   # The answer given by the developer
    is_answered = Column(Boolean, default=False)
    context_key = Column(String(100), nullable=True)
    created_at = Column(Integer, default=lambda: int(time.time()))
    answered_at = Column(Integer, nullable=True)

    repository = relationship("Repository", back_populates="onboarding_questions")


# Database Engine setup for the app's own metadata store (companies, repos,
# db_connections, chat history, etc -- NOT the customer's target database).
# This used to be SQLite-only. On Vercel that meant every cold start (and
# every redeploy) got a brand new, empty /tmp/zeroticket.db -- data from one
# request could vanish by the next. Support Postgres too (point DATABASE_URL
# at a real hosted Postgres in production) while keeping SQLite working for
# local dev, since that's still the quickest zero-setup option there.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_engine_kwargs = {"connect_args": {"check_same_thread": False, "timeout": 30}} if _is_sqlite else {}
engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

from sqlalchemy import event
if _is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def _auto_migrate(connection):
    """Add any missing columns to existing SQLite tables without dropping data."""
    cursor = connection.cursor()
    for table in Base.metadata.sorted_tables:
        try:
            cursor.execute(f"PRAGMA table_info({table.name})")
            existing_cols = {row[1] for row in cursor.fetchall()}
        except Exception:
            existing_cols = set()
        for col in table.columns:
            if col.name not in existing_cols:
                col_type = col.type.compile(engine.dialect)
                nullable = "" if col.nullable else " NOT NULL"
                default = ""
                if col.default is not None:
                    try:
                        val = col.default.arg
                        if callable(val):
                            val = val()
                        if isinstance(val, str):
                            default = f" DEFAULT '{val}'"
                        else:
                            default = f" DEFAULT {val}"
                    except Exception:
                        pass
                try:
                    cursor.execute(
                        f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}{nullable}{default}"
                    )
                    print(f"[db] Auto-migrated: {table.name}.{col.name} ({col_type})")
                except Exception as e:
                    # Column may already exist or is non-nullable without a default — skip silently.
                    pass
    connection.commit()

def init_db():
    Base.metadata.create_all(bind=engine)
    # Auto-migrate: add any columns present in the model but missing from the DB file.
    # This uses raw SQLite PRAGMA/ALTER TABLE syntax, so it only applies there.
    # On Postgres, create_all() above already creates any missing tables; adding
    # a real migration tool (e.g. Alembic) is the correct path for future schema
    # changes against a persistent store, rather than ad hoc ALTER TABLE calls.
    if _is_sqlite:
        with engine.connect() as conn:
            _auto_migrate(conn.connection)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Encryption helpers for DB Connection Password
def get_fernet():
    try:
        return Fernet(settings.ENCRYPTION_KEY.encode('utf-8'))
    except Exception as e:
        # Fallback to key derivation if user provided custom key of wrong length
        import base64
        import hashlib
        key_hash = hashlib.sha256(settings.ENCRYPTION_KEY.encode('utf-8')).digest()
        key_b64 = base64.urlsafe_b64encode(key_hash)
        return Fernet(key_b64)

def encrypt_password(password: str) -> str:
    f = get_fernet()
    return f.encrypt(password.encode('utf-8')).decode('utf-8')

def decrypt_password(encrypted: str) -> str:
    f = get_fernet()
    return f.decrypt(encrypted.encode('utf-8')).decode('utf-8')


# Target database connection creator
def get_target_db_conn(conn_details: DBConnection):
    password = decrypt_password(conn_details.encrypted_db_pass)
    db_type = getattr(conn_details, "db_type", "mysql") or "mysql"
    if db_type == "postgres" or db_type == "postgresql":
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(
            host=conn_details.db_host,
            port=conn_details.db_port or 5432,
            user=conn_details.db_user,
            password=password,
            database=conn_details.db_name,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=5
        )
        return conn
    else:
        import pymysql
        conn = pymysql.connect(
            host=conn_details.db_host,
            port=conn_details.db_port or 3306,
            user=conn_details.db_user,
            password=password,
            database=conn_details.db_name,
            cursorclass=pymysql.cursors.DictCursor,
            connect_timeout=5
        )
        return conn
