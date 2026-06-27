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
    api_key_hash = Column(String(64), nullable=False, unique=True)
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    repositories = relationship("Repository", back_populates="company", cascade="all, delete-orphan")
    db_connection = relationship("DBConnection", back_populates="company", uselist=False, cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="company", cascade="all, delete-orphan")

class Repository(Base):
    __tablename__ = 'repositories'
    id = Column(String(36), primary_key=True)
    company_id = Column(String(36), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False)
    provider = Column(Enum('github', 'gitlab', 'bitbucket', name='provider_enum'), nullable=False, default='github')
    repo_name = Column(String(255), nullable=False)  # For local repos, this can be the folder path
    branch = Column(String(100), default='main')
    sync_status = Column(Enum('pending', 'cloning', 'parsing', 'linked', 'failed', name='sync_status_enum'), nullable=False, default='pending')
    last_synced_at = Column(Integer, nullable=True)
    
    company = relationship("Company", back_populates="repositories")

class DBConnection(Base):
    __tablename__ = 'db_connections'
    id = Column(String(36), primary_key=True)
    company_id = Column(String(36), ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, unique=True)
    db_host = Column(String(255), nullable=False)
    db_port = Column(Integer, default=3306)
    db_user = Column(String(100), nullable=False)
    encrypted_db_pass = Column(Text, nullable=False)
    db_name = Column(String(100), nullable=False)
    ssl_required = Column(Boolean, default=False)
    created_at = Column(Integer, default=lambda: int(time.time()))
    
    company = relationship("Company", back_populates="db_connection")

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


# Database Engine setup for SQLite system DB
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

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
    conn = pymysql.connect(
        host=conn_details.db_host,
        port=conn_details.db_port,
        user=conn_details.db_user,
        password=password,
        database=conn_details.db_name,
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5  # connection setup timeout
    )
    return conn
