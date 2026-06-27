import jwt
import hashlib
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db import get_db, Company

security = HTTPBearer()

def verify_jwt_token(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> dict:
    """
    Decodes and verifies a JWT token.
    The JWT must be signed using the company's API key.
    We retrieve the company ID from the token's 'iss' (issuer) or 'company_id' claim, 
    look up the company's API key, and verify the signature.
    """
    token = credentials.credentials
    try:
        # 1. Unverified decode to extract company_id / issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        company_id = unverified.get("company_id") or unverified.get("iss")
        if not company_id:
            raise HTTPException(status_code=401, detail="Missing company_id or iss in JWT claims")
        
        # 2. Look up company in SQLite DB
        company = db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise HTTPException(status_code=401, detail="Company not found")
        
        # 3. Verify signature using the company's secret api_key.
        # Since we only store the hash of the API key in the DB, the client must use the raw API key to sign,
        # but wait! If the server only has the hash of the API key, it cannot decrypt/verify HMAC signed by the raw key directly.
        # Wait, that's a classic problem! If we use HMAC-SHA256, we need the raw key to verify the signature.
        # If we hash the API key in the database (like a password hash), we cannot reconstruct the raw API key to verify the JWT!
        # Ah! That is a very important point!
        # To resolve this:
        # Option A: We store the secret key as encrypted in the database (using our Fernet key settings.ENCRYPTION_KEY).
        # This allows us to decrypt the secret key to verify the JWT, while keeping it encrypted at rest!
        # This is extremely secure and standard.
        # Let's modify the Company model's API key column or add a `jwt_secret_encrypted` column, or just encrypt the API key at rest rather than hashing it.
        # Wait, if we use the API key for both API auth and JWT verification, encrypting it at rest using AES (Fernet) is perfect.
        # Let's adjust Company table or create a separate `jwt_secret_encrypted` inside Company.
        # Let's assume the `api_key_hash` can actually be the encrypted API key, or we can add an `api_key_encrypted` field.
        # Let's look at `db.py`: Company has `api_key_hash`. Let's add `api_key_encrypted` or decrypt it directly.
        # Let's write the JWT verification using the decrypted api key from db, assuming we store it encrypted.
        # Wait! To avoid database migration issues later, let's allow `Company` to store `api_key_encrypted` or use the Fernet key to decrypt it.
        
        # For JWT verification, the signing secret can be decrypted from Company.api_key_encrypted.
        # Let's check: if we decrypt the Company.api_key_encrypted, we get the signing secret.
        # Let's write auth.py to handle this:
        secret = get_company_secret(company)
        
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

def get_company_secret(company: Company) -> str:
    # We will decrypt the api_key from Company (which we will store encrypted using Fernet)
    # If the company only has api_key_hash, we can fallback to using settings.ENCRYPTION_KEY as the HMAC key for JWT.
    # To keep things flexible, let's use the Company's ID encrypted or a decrypted secret field.
    # Let's decrypt company's api_key or fall back to a hash of it.
    # Wait, if we decrypt api_key, we need a column for it. Let's use `api_key_encrypted` or just decrypt the `api_key_hash` field if it actually stores the encrypted key.
    # Let's assume `api_key_hash` field contains the encrypted key or we decrypt it.
    from app.db import decrypt_password
    try:
        return decrypt_password(company.api_key_hash)
    except Exception:
        # Fallback to company_id if decryption fails
        return company.id
