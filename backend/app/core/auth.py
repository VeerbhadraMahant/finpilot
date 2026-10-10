"""Backend authentication: verifies Firebase ID tokens (signature checked
against Google's public certs, no per-request round trip to our own services).

SECURITY CONTEXT: before this module existed, every API route trusted a
`user_id` path parameter with zero verification -- any caller could read or
mutate any other user's financial data simply by supplying their id (an
IDOR vulnerability). The backend reaches Firestore through the Admin SDK,
which bypasses security rules, so this module is the gate: real (non-demo)
user data requires a valid, matching Firebase session token.

The 3 seeded demo personas (demo-priya/arjun/meera) remain reachable with NO
token, by design -- they're fixed, public fixture data meant for judges/
reviewers to try the app without signing in, so there is nothing to protect
there.
"""
from __future__ import annotations

import re

from fastapi import Header, HTTPException
from google.auth import exceptions as google_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.core.config import get_settings

DEMO_USER_IDS = {"demo-priya", "demo-arjun", "demo-meera"}

# Anonymous sandbox visitors get a random, unguessable `guest-<id>` made in
# their browser. Only synthetic connector data (see api/connectors_router.py)
# ever lands under one, so it is reachable without a token like the demo
# personas -- but isolated per id, and never mixed with real accounts.
_GUEST_ID = re.compile(r"^guest-[a-z0-9]{12,32}$")


def is_public_user(user_id: str) -> bool:
    return user_id in DEMO_USER_IDS or bool(_GUEST_ID.match(user_id))


def verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token's signature (Google's public certs), expiry,
    issuer and audience (= our project id). Never returns claims for an
    unverified token."""
    try:
        return google_id_token.verify_firebase_token(
            token, google_requests.Request(), audience=get_settings().firebase_project_id
        )
    except google_exceptions.TransportError as exc:
        raise HTTPException(503, f"Could not verify token (auth service unreachable): {exc}") from exc
    except ValueError as exc:
        raise HTTPException(401, f"Invalid or expired token: {exc}") from exc


verify_token = verify_firebase_token


async def resolve_user_id(user_id: str, authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency: the single seam every route uses to turn a raw
    path-param `user_id` into a trusted one.

    - Demo personas: always allowed, token optional (public fixture data).
    - Any other `user_id`: a valid Firebase bearer token is required, and
      its verified `sub` claim MUST equal the requested `user_id` --
      otherwise this would let any signed-in user read/mutate a different
      real user's data just by changing the URL.
    """
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(401, "Authorization header must be 'Bearer <token>'")
        claims = verify_token(token)
        verified_user_id = claims.get("sub") or claims.get("user_id")
        if not verified_user_id:
            raise HTTPException(401, "Token has no subject claim")
        if is_public_user(user_id):
            return user_id  # demo personas / guest sandboxes stay browsable even while signed in
        if verified_user_id != user_id:
            raise HTTPException(403, "Token does not authorize access to this user_id")
        return verified_user_id

    if is_public_user(user_id):
        return user_id
    raise HTTPException(401, "Authentication required for non-demo users")
